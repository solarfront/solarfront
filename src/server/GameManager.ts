import { Logger } from "winston";
import { ServerConfig } from "../core/configuration/Config";
import { Difficulty, GameMapType, GameMode, GameType } from "../core/game/Game";
import { GameConfig, GameID } from "../core/Schemas";
import { Client } from "./Client";
import { GamePhase, GameServer, ServerPlayerData } from "./GameServer";

export class GameManager {
  private games: Map<GameID, GameServer> = new Map();

  constructor(
    private config: ServerConfig,
    private log: Logger,
  ) {
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.checkClientState(), 4000);
  }

  public game(id: GameID): GameServer | null {
    return this.games.get(id) ?? null;
  }

  public getAllGames(): Map<GameID, GameServer> {
    return this.games;
  }

  addClient(client: Client, gameID: GameID, lastTurn: number): boolean {
    const game = this.games.get(gameID);
    if (game) {
      game.addClient(client, lastTurn);
      return true;
    }
    return false;
  }

  async createGame(id: GameID, gameConfig: GameConfig | undefined) {
    const finalConfig = {
      gameMap: GameMapType.Space1,
      gameType: GameType.Private,
      difficulty: Difficulty.Easy,
      disableNPCs: false,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      gameMode: GameMode.FFA,
      bots: 400,
      disabledUnits: [],
      ...gameConfig,
    };

    const game = new GameServer(
      id,
      this.log,
      Date.now(),
      this.config,
      finalConfig,
    );

    this.games.set(id, game);
    return game;
  }

  activeGames(): number {
    return this.games.size;
  }

  activeClients(): number {
    let totalClients = 0;
    this.games.forEach((game: GameServer) => {
      totalClients += game.activeClients.length;
    });
    return totalClients;
  }

  /**
   * Find disconnected or desynced players and process their player data
   * REASON: If player disconnects from the game whilst alive their client never sends the death notification
   */
  processDisconnectedPlayers(game: GameServer): void {
    const now = Date.now();
    const allPlayers = Array.from(game.getAllPlayerData().values());
    const clientIds = game.activeClients.map((client) => client.clientID);

    const disconnectedPlayers: ServerPlayerData[] = [];
    const connectedPlayers: ServerPlayerData[] = [];

    for (const player of allPlayers) {
      if (clientIds.includes(player.clientID)) {
        connectedPlayers.push(player);
      } else {
        disconnectedPlayers.push(player);
      }
    }

    for (const player of disconnectedPlayers) {
      const playerData = player as ServerPlayerData;
      playerData.isDisconnected = true;
      player.isAlive = false;
    }

    for (const player of connectedPlayers) {
      const playerData = player as ServerPlayerData;
      // If the player has not sent any data in the last 20 seconds, they are disconnected
      if (
        playerData.serverReceivedAt &&
        now - playerData.serverReceivedAt > 20_000
      ) {
        playerData.isDisconnected = true;
        player.isAlive = false;
        // game.kickClient(player.clientID);
      }
    }
  }

  /**
   * Check client state and handle disconnected players
   */
  checkClientState() {
    for (const [id, game] of this.games) {
      const phase = game.phase();

      if (phase === GamePhase.Active && game.hasStarted()) {
        this.processDisconnectedPlayers(game);
      }
    }
  }

  tick() {
    const active = new Map<GameID, GameServer>();
    for (const [id, game] of this.games) {
      //const phase = game.phase();
      let phase = game.phase();

      if (phase === GamePhase.Active) {
        if (!game.hasStarted()) {
          // Prestart tells clients to start loading the game.
          game.prestart();
          // Start game on delay to allow time for clients to connect.
          setTimeout(async () => {
            try {
              game.start();
            } catch (error) {
              this.log.error(`error starting game ${id}: ${error}`);
            }
          }, 2000);
        }
      }

      if (phase === GamePhase.Finished) {
        try {
          this.log.info(`[GameManager] ending game ${id}`, {
            gamePhase: game.phase(),
            playerCount: game.activeClients.length,
          });

          game.end();
        } catch (error) {
          this.log.error(`error ending game ${id}: ${error}`);
        }
      } else {
        active.set(id, game);
      }
    }
    this.games = active;
  }
}
