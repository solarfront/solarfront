import cluster from "cluster";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";
import { GameInfo } from "../core/Schemas";
import { generateID, MIN_PLAYERS_TO_START } from "../core/Util";
import { gatekeeper, LimiterType } from "./Gatekeeper";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";

const config = getServerConfigFromServer();
const playlist = new MapPlaylist();
const readyWorkers = new Set();

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(
  cors({
    origin: [
      "https://solarfront.io",
      "https://www.solarfront.io",
      "https://api.solarfront.io",
      "https://dev-api.solarfront.io",
      "http://localhost:9000",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const log = logger.child({ comp: "m" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.json());
app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res, path) => {
      // You can conditionally set different cache times based on file types
      if (path.endsWith(".html")) {
        // Set HTML files to no-cache to ensure Express doesn't send 304s
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        // Prevent conditional requests
        res.setHeader("ETag", "");
      } else if (path.match(/\.(js|css|svg)$/)) {
        // JS, CSS, SVG get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (path.match(/\.(bin|dat|exe|dll|so|dylib)$/)) {
        // Binary files also get long cache with immutable
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      // Other file types use the default maxAge setting
    },
  }),
);
app.use(express.json());

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
  }),
);

let publicLobbiesJsonStr = "";

const publicLobbyIDs: Set<string> = new Set();

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  log.info(`Setting up ${config.numWorkers()} workers...`);

  // Fork workers with staggered startup to prevent race conditions
  for (let i = 0; i < config.numWorkers(); i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
    });

    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);

    // Add 100ms delay between worker startups to prevent race conditions
    if (i < config.numWorkers() - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  cluster.on("message", (worker, message) => {
    if (message.type === "WORKER_READY") {
      const workerId = message.workerId;
      readyWorkers.add(workerId);
      log.info(
        `Worker ${workerId} is ready. (${readyWorkers.size}/${config.numWorkers()} ready)`,
      );
      // Start scheduling when all workers are ready
      if (readyWorkers.size === config.numWorkers()) {
        log.info("All workers ready, starting game scheduling");

        const scheduleLobbies = () => {
          schedulePublicGame(playlist).catch((error) => {
            log.error("Error scheduling public game:", error);
          });
        };

        setInterval(
          () =>
            fetchLobbies().then((lobbies) => {
              if (lobbies === 0) {
                scheduleLobbies();
              }
            }),
          100,
        );
      }
    }
  });

  // Add startup timeout monitoring
  setTimeout(() => {
    const expectedWorkers = config.numWorkers();
    const readyCount = readyWorkers.size;

    if (readyCount < expectedWorkers) {
      log.error(
        `Startup timeout: Only ${readyCount}/${expectedWorkers} workers ready after 60 seconds`,
      );
      log.info(
        "This may indicate worker startup issues or resource constraints",
      );

      // Optionally restart missing workers
      for (let i = 0; i < expectedWorkers; i++) {
        if (!readyWorkers.has(i)) {
          log.info(`Attempting to restart missing worker ${i}`);
          cluster.fork({ WORKER_ID: i });
        }
      }
    }
  }, 60000); // 60 second timeout

  // Handle worker crashes and add health monitoring
  cluster.on("exit", (worker, code, signal) => {
    const workerId = (worker as any).process?.env?.WORKER_ID;
    if (!workerId) {
      log.error(`worker crashed could not find id`);
      return;
    }

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );

    // Remove from ready workers set
    readyWorkers.delete(parseInt(workerId));

    log.info(`Restarting worker ${workerId}...`);

    // Add delay before restart to prevent rapid restart loops
    setTimeout(() => {
      const newWorker = cluster.fork({
        WORKER_ID: workerId,
      });

      log.info(
        `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
      );
    }, 1000); // 1 second delay before restart
  });

  // Add periodic health check for workers
  setInterval(() => {
    const expectedWorkers = config.numWorkers();
    const actualWorkers = Object.keys(cluster.workers || {}).length;
    const readyCount = readyWorkers.size;

    if (actualWorkers < expectedWorkers || readyCount < expectedWorkers) {
      log.warn(
        `Worker health check: Expected ${expectedWorkers}, Running ${actualWorkers}, Ready ${readyCount}`,
      );
    }
  }, 30000); // Check every 30 seconds

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });
}

// Removed updateFakePlayerCount function

app.get(
  "/api/env",
  gatekeeper.httpHandler(LimiterType.Get, async (req, res) => {
    const envConfig = {
      game_env: process.env.GAME_ENV || "prod",
    };
    res.json(envConfig);
  }),
);

// Add lobbies endpoint to list public games for this worker
app.get(
  "/api/public_lobbies",
  gatekeeper.httpHandler(LimiterType.Get, async (req, res) => {
    res.send(publicLobbiesJsonStr);
  }),
);

app.post(
  "/api/kick_player/:gameID/:clientID",
  gatekeeper.httpHandler(LimiterType.Post, async (req, res) => {
    if (req.headers[config.adminHeader()] !== config.adminToken()) {
      res.status(401).send("Unauthorized");
      return;
    }

    const { gameID, clientID } = req.params;

    try {
      const response = await fetch(
        `http://localhost:${config.workerPort(gameID)}/api/kick_player/${gameID}/${clientID}`,
        {
          method: "POST",
          headers: {
            [config.adminHeader()]: config.adminToken(),
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to kick player: ${response.statusText}`);
      }

      res.status(200).send("Player kicked successfully");
    } catch (error) {
      log.error(`Error kicking player from game ${gameID}:`, error);
      res.status(500).send("Failed to kick player");
    }
  }),
);

async function fetchLobbies(): Promise<number> {
  const fetchPromises: Promise<GameInfo | null>[] = [];

  for (const gameID of publicLobbyIDs) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000); // 5 second timeout
    const port = config.workerPort(gameID);
    const promise = fetch(`http://localhost:${port}/api/game/${gameID}`, {
      headers: { [config.adminHeader()]: config.adminToken() },
      signal: controller.signal,
    })
      .then((resp) => resp.json())
      .then((json) => {
        return json as GameInfo;
      })
      .catch((error) => {
        log.error(`Error fetching game ${gameID}:`, error);
        // Return null or a placeholder if fetch fails
        return null;
      });

    fetchPromises.push(promise);
  }

  // Wait for all promises to resolve
  const results = await Promise.all(fetchPromises);

  // Filter out any null results from failed fetches
  const lobbyInfos: GameInfo[] = results
    .filter((result) => result !== null)
    .map((gi: GameInfo) => {
      const realClients = gi?.clients?.length ?? 0;
      const msUntilStart = (gi.msUntilStart ?? Date.now()) - Date.now();

      return {
        gameID: gi.gameID,
        numClients: realClients,
        gameConfig: gi.gameConfig,
        msUntilStart: msUntilStart,
      } as GameInfo;
    });

  lobbyInfos.forEach((l) => {
    if (
      "msUntilStart" in l &&
      l.msUntilStart !== undefined &&
      l.msUntilStart <= 250
    ) {
      publicLobbyIDs.delete(l.gameID);
      return;
    }

    if (
      "gameConfig" in l &&
      l.gameConfig !== undefined &&
      "maxPlayers" in l.gameConfig &&
      l.gameConfig.maxPlayers !== undefined &&
      "numClients" in l &&
      l.numClients !== undefined &&
      l.gameConfig.maxPlayers <= l.numClients
    ) {
      publicLobbyIDs.delete(l.gameID);
      return;
    }
  });

  // Update the JSON string
  publicLobbiesJsonStr = JSON.stringify({
    lobbies: lobbyInfos,
  });

  return publicLobbyIDs.size;
}


// Function to schedule a new public game
async function schedulePublicGame(playlist: MapPlaylist) {
  const gameID = generateID();
  publicLobbyIDs.add(gameID);

  const workerPath = config.workerPath(gameID);

  // Send request to the worker to start the game
  try {
    const response = await fetch(
      `http://localhost:${config.workerPort(gameID)}/api/create_game/${gameID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [config.adminHeader()]: config.adminToken(),
        },
        body: JSON.stringify({
          gameConfig: playlist.gameConfig(),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to schedule public game: ${response.statusText}`);
    }

    const data = await response.json();
  } catch (error) {
    log.error(`Failed to schedule public game on worker ${workerPath}:`, error);
    throw error;
  }
}


// SPA fallback route
app.get("*", function (req, res) {
  res.sendFile(path.join(__dirname, "../../static/index.html"));
});
