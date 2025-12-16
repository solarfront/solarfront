import { consolex, initRemoteSender } from "../core/Consolex";
import { EventBus } from "../core/EventBus";
import {
  ClientID,
  GameID,
  GameRecord,
  GameStartInfo,
  PlayerRecord,
  ServerMessage,
} from "../core/Schemas";
import { createGameRecord } from "../core/Util";
import { ServerConfig } from "../core/configuration/Config";
import { getConfig } from "../core/configuration/ConfigLoader";
import { Cell, Team, UnitType } from "../core/game/Game";
import { TileRef } from "../core/game/GameMap";
import {
  ErrorUpdate,
  GameUpdateType,
  GameUpdateViewData,
  HashUpdate,
  WinUpdate,
} from "../core/game/GameUpdates";
import { GameView, PlayerView } from "../core/game/GameView";
import { loadTerrainMap, TerrainMapData } from "../core/game/TerrainMapLoader";
import { UserSettings } from "../core/game/UserSettings";
import { WorkerClient } from "../core/worker/WorkerClient";
import { BuildingDropEvent, HotkeyTransportShipEvent, InputHandler, MouseMoveEvent, MouseUpEvent } from "./InputHandler";
import { endGame, startGame, startTime } from "./LocalPersistantStats";
import { getPersistentIDFromCookie } from "./Main";
import {
  BuildUnitIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendHashEvent,
  SendPlayerDataEvent,
  SendSpawnIntentEvent,
  Transport,
} from "./Transport";
import { createCanvas, translateText } from "./Utils";
import { createRenderer, GameRenderer } from "./graphics/GameRenderer";
import { SoundManager } from "./soundeffects/effects/SoundManager";

export interface LobbyConfig {
  serverConfig: ServerConfig;
  flag: string;
  playerName: string;
  clientID: ClientID;
  gameID: GameID;
  token: string;
  // GameStartInfo only exists when playing a singleplayer game.
  gameStartInfo?: GameStartInfo;
  // GameRecord exists when replaying an archived game.
  gameRecord?: GameRecord;
  // Optional wallet address for blockchain games
  walletAddress?: string | null;
}

export function joinLobby(
  lobbyConfig: LobbyConfig,
  onPrestart: () => void,
  onJoin: () => void,
): () => void {
  const eventBus = new EventBus();
  initRemoteSender(eventBus);

  consolex.log(
    `joining lobby: gameID: ${lobbyConfig.gameID}, clientID: ${lobbyConfig.clientID}`,
  );

  const userSettings: UserSettings = new UserSettings();
  startGame(lobbyConfig.gameID, lobbyConfig.gameStartInfo?.config ?? {});

  const transport = new Transport(lobbyConfig, eventBus);

  consolex.log(`lobbyConfig: ${JSON.stringify(lobbyConfig)}`);

  const onconnect = () => {
    consolex.log(`Joined game lobby ${lobbyConfig.gameID}`);
    transport.joinGame(0);
  };
  let terrainLoad: Promise<TerrainMapData> | null = null;

  const onmessage = (message: ServerMessage) => {
    if (message.type === "prestart") {
      //consolex.log(`lobby: game prestarting: ${JSON.stringify(message)}`);
      terrainLoad = loadTerrainMap(message.gameMap);
      onPrestart();
    }
    if (message.type === "start") {
      // Trigger prestart for singleplayer games
      onPrestart();
      //consolex.log(`lobby: game started: ${JSON.stringify(message, null, 2)}`);
      onJoin();
      // For multiplayer games, GameStartInfo is not known until game starts.
      lobbyConfig.gameStartInfo = message.gameStartInfo;
      createClientGame(
        lobbyConfig,
        eventBus,
        transport,
        userSettings,
        terrainLoad,
      ).then((r) => r.start());
    }
  };

  transport.connect(onconnect, onmessage);

  return () => {
    consolex.log("leaving game");
    transport.leaveGame();
  };
}

export async function createClientGame(
  lobbyConfig: LobbyConfig,
  eventBus: EventBus,
  transport: Transport,
  userSettings: UserSettings,
  terrainLoad: Promise<TerrainMapData> | null,
): Promise<ClientGameRunner> {
  if (lobbyConfig.gameStartInfo === undefined) {
    throw new Error("missing gameStartInfo");
  }

  const config = await getConfig(
    lobbyConfig.gameStartInfo.config,
    userSettings,
    lobbyConfig.gameRecord !== undefined,
  );
  let gameMap: TerrainMapData | null = null;

  if (terrainLoad) {
    gameMap = await terrainLoad;
  } else {
    gameMap = await loadTerrainMap(lobbyConfig.gameStartInfo.config.gameMap);
  }
  const worker = new WorkerClient(
    lobbyConfig.gameStartInfo,
    lobbyConfig.clientID,
  );
  await worker.initialize();
  const gameView = new GameView(
    worker,
    config,
    gameMap.gameMap,
    lobbyConfig.clientID,
    lobbyConfig.gameStartInfo.gameID,
    lobbyConfig.gameStartInfo.players.length,
  );

  consolex.log("going to init path finder");
  consolex.log("inited path finder");
  const canvas = createCanvas();
  const gameRenderer = createRenderer(
    canvas,
    gameView,
    eventBus,
    lobbyConfig.clientID,
  );

  consolex.log(
    `creating private game got difficulty: ${lobbyConfig.gameStartInfo.config.difficulty}`,
  );

  console.log(
    `[ClientGameRunner] Creating game for clientID: ${lobbyConfig.clientID}, gameID: ${lobbyConfig.gameID}`,
  );

  return new ClientGameRunner(
    lobbyConfig,
    eventBus,
    gameRenderer,
    new InputHandler(canvas, eventBus),
    transport,
    worker,
    gameView,
  );
}

export class ClientGameRunner {
  private myPlayer: PlayerView | null = null;
  private isActive = false;

  private turnsSeen = 0;
  private hasJoined = false;

  private lastMousePosition: { x: number; y: number } | null = null;

  private lastMessageTime: number = 0;
  private connectionCheckInterval: NodeJS.Timeout | null = null;

  private didSendDeathNotification: boolean = false;

  constructor(
    private lobby: LobbyConfig,
    private eventBus: EventBus,
    private renderer: GameRenderer,
    private input: InputHandler,
    private transport: Transport,
    private worker: WorkerClient,
    private gameView: GameView,
  ) {
    this.lastMessageTime = Date.now();
  }

  private saveGame(update: WinUpdate) {
    const players: PlayerRecord[] = [
      {
        ip: null,
        persistentID: getPersistentIDFromCookie(),
        username: this.lobby.playerName,
        clientID: this.lobby.clientID,
      },
    ];
    let winner: ClientID | Team | null = null;
    if (update.winnerType === "player") {
      winner = this.gameView
        .playerBySmallID(update.winner as number)
        .clientID();
    } else {
      winner = update.winner as Team;
    }

    if (this.lobby.gameStartInfo === undefined) {
      throw new Error("missing gameStartInfo");
    }
    const record = createGameRecord(
      this.lobby.gameStartInfo.gameID,
      this.lobby.gameStartInfo,
      players,
      // Not saving turns locally
      [],
      startTime(),
      Date.now(),
      winner,
      update.winnerType,
      update.allPlayersStats,
    );
    endGame(record);
  }

  /**
   * Get the local player.
   * Returns The local player, or null if not found.
   */
  getLocalPlayer(): PlayerView | null {
    const localPlayer = this.gameView.playerByClientID(this.lobby.clientID);

    if (localPlayer === null) return null;

    return localPlayer;
  }

  public start() {
    consolex.log("starting client game");
    
    // Play game start sound
    SoundManager.getInstance().playGameStart();

    this.isActive = true;
    this.lastMessageTime = Date.now();
    setTimeout(() => {
      this.connectionCheckInterval = setInterval(
        () => this.onConnectionCheck(),
        1000,
      );
    }, 20000);
    this.eventBus.on(MouseUpEvent, (e) => this.inputEvent(e));
    this.eventBus.on(MouseMoveEvent, (e) => this.onMouseMove(e));
    this.eventBus.on(BuildingDropEvent, (e) => this.onBuildingDrop(e));
    this.eventBus.on(HotkeyTransportShipEvent, (e) => this.onHotkeyTransportShip(e));

    this.renderer.initialize();
    this.input.setTransformHandler(this.renderer.transformHandler);
    this.input.initialize();
    this.worker.start((gu: GameUpdateViewData | ErrorUpdate) => {
      if (this.lobby.gameStartInfo === undefined) {
        throw new Error("missing gameStartInfo");
      }
      if ("errMsg" in gu) {
        showErrorModal(
          gu.errMsg,
          gu.stack ?? "missing",
          this.lobby.gameStartInfo.gameID,
          this.lobby.clientID,
        );
        console.error(gu.stack);
        this.stop(true);
        return;
      }
      this.transport.turnComplete();
      gu.updates[GameUpdateType.Hash].forEach((hu: HashUpdate) => {
        this.eventBus.emit(new SendHashEvent(hu.tick, hu.hash));
      });

      // Send player data to server, this doesnt need to be done every turn though.
      const localPlayer = this.getLocalPlayer();
      const currentTick = this.gameView.ticks();

      // If player has died, send one last message to the server to inform that the player has died.
      if (
        localPlayer &&
        localPlayer.hasSpawned() &&
        !localPlayer.isAlive() &&
        !this.didSendDeathNotification
      ) {
        // Calculate survival time (current game tick)
        const survivalTime = currentTick;

        this.eventBus.emit(
          new SendPlayerDataEvent(
            this.lobby.clientID,
            this.lobby.playerName,
            localPlayer.numTilesOwned(),
            this.gameView.numTilesWithFallout(),
            this.gameView.numLandTiles(),
            localPlayer.gold(),
            localPlayer.isAlive(),
            localPlayer.hasSpawned(),
            localPlayer.troops(),
            localPlayer.workers(),
            localPlayer.population(),
            survivalTime,
          ),
        );

        this.didSendDeathNotification = true;
      }

      // Send player data to server every 10 ticks
      if (currentTick % 10 === 0 && localPlayer && localPlayer.isAlive()) {
        // Calculate survival time (current game tick)
        const survivalTime = currentTick;

        this.eventBus.emit(
          new SendPlayerDataEvent(
            this.lobby.clientID,
            this.lobby.playerName,
            localPlayer.numTilesOwned(),
            this.gameView.numTilesWithFallout(),
            this.gameView.numLandTiles(),
            localPlayer.gold(),
            localPlayer.isAlive(),
            localPlayer.hasSpawned(),
            localPlayer.troops(),
            localPlayer.workers(),
            localPlayer.population(),
            survivalTime,
          ),
        );
      }

      this.gameView.update(gu);
      this.renderer.tick();

      if (gu.updates[GameUpdateType.Win].length > 0) {
        this.saveGame(gu.updates[GameUpdateType.Win][0]);
      }
    });
    const worker = this.worker;
    const keepWorkerAlive = () => {
      worker.sendHeartbeat();
      requestAnimationFrame(keepWorkerAlive);
    };
    requestAnimationFrame(keepWorkerAlive);

    const onconnect = () => {
      consolex.log("Connected to game server!");
      this.transport.joinGame(this.turnsSeen);
    };
    const onmessage = (message: ServerMessage) => {
      this.lastMessageTime = Date.now();
      if (message.type === "start") {
        this.hasJoined = true;
        consolex.log("starting game!");
        for (const turn of message.turns) {
          if (turn.turnNumber < this.turnsSeen) {
            continue;
          }
          while (turn.turnNumber - 1 > this.turnsSeen) {
            this.worker.sendTurn({
              turnNumber: this.turnsSeen,
              intents: [],
            });
            this.turnsSeen++;
          }
          this.worker.sendTurn(turn);
          this.turnsSeen++;
        }
      }
      if (message.type === "desync") {
        if (this.lobby.gameStartInfo === undefined) {
          throw new Error("missing gameStartInfo");
        }
        showErrorModal(
          `desync from server: ${JSON.stringify(message)}`,
          "",
          this.lobby.gameStartInfo.gameID,
          this.lobby.clientID,
          true,
          "You are desynced from other players. What you see might differ from other players.",
        );
      }
      if (message.type === "turn") {
        if (!this.hasJoined) {
          this.transport.joinGame(0);
          return;
        }
        if (this.turnsSeen !== message.turn.turnNumber) {
          consolex.error(
            `got wrong turn have turns ${this.turnsSeen}, received turn ${message.turn.turnNumber}`,
          );
        } else {
          this.worker.sendTurn(message.turn);
          this.turnsSeen++;
        }
      }

      if (message.type === "end") {
        consolex.log(
          `Server sent end game message: ${JSON.stringify(message, null, 2)}`,
        );

        // Show win modal before stopping the game
        const winModal = document.querySelector("win-modal") as any;
        if (winModal && winModal.show) {
          // Determine the winner and set appropriate title
          const winners = message.winners;
          if (winners && winners.length > 0) {
            const myClientID = this.lobby.clientID;

            // Check if the current player is among the winners
            const myWinnerData = winners.find(
              (winner) => winner.clientID === myClientID,
            );

            if (myWinnerData) {
              // Player is in the winners array - determine their position
              // Filter out disconnected players for ranking purposes
              const activeWinners = winners.filter(
                (winner) => !winner.isDisconnected,
              );
              const myActivePosition =
                activeWinners.findIndex(
                  (winner) => winner.clientID === myClientID,
                ) + 1;

              if (myActivePosition === 1) {
                winModal._title = translateText("win_modal.you_won");
              } else if (myActivePosition === 2) {
                winModal._title = translateText("win_modal.second_place");
              } else if (myActivePosition === 3) {
                winModal._title = translateText("win_modal.third_place");
              } else {
                // For positions 4 and beyond, show a generic message
                winModal._title = translateText("win_modal.victory");
              }
            } else {
              // Player is not in the winners array, show the first place winner
              // Filter out disconnected players to find the actual winner
              const activeWinners = winners.filter(
                (winner) => !winner.isDisconnected,
              );
              const winner = activeWinners[0] || winners[0]; // Fallback to first in array if no active players
              winModal._title = translateText("win_modal.other_won", {
                player: winner.username,
              });
            }

            winModal.show();
          } else {
            // No winners data, show generic end message
            winModal._title = "Game Ended";
            winModal.show();
          }
        }

        this.stop(false);
      }
    };
    this.transport.connect(onconnect, onmessage);
  }

  public stop(saveFullGame: boolean = false) {
    this.worker.cleanup();
    this.isActive = false;
    this.transport.leaveGame(saveFullGame);
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  private inputEvent(event: MouseUpEvent) {
    if (!this.isActive) {
      return;
    }
    const cell = this.renderer.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.gameView.isValidCoord(cell.x, cell.y)) {
      return;
    }
    consolex.log(`clicked cell Cell[${cell.x},${cell.y}]`);
    const tile = this.gameView.ref(cell.x, cell.y);
    if (
      this.gameView.isLand(tile) &&
      !this.gameView.hasOwner(tile) &&
      this.gameView.inSpawnPhase()
    ) {
      console.log(
        `[ClientGameRunner] Sending spawn intent for clientID: ${this.lobby.clientID}, username: ${this.lobby.playerName}, cell:`,
        cell,
      );
      this.eventBus.emit(new SendSpawnIntentEvent(cell));
      return;
    }
    if (this.gameView.inSpawnPhase()) {
      return;
    }
    if (this.myPlayer === null) {
      const myPlayer = this.gameView.playerByClientID(this.lobby.clientID);
      if (myPlayer === null) return;
      this.myPlayer = myPlayer;
    }
    this.myPlayer.actions(tile).then((actions) => {
      if (this.myPlayer === null) return;
      const bu = actions.buildableUnits.find(
        (bu) => bu.type === UnitType.TransportShip,
      );
      if (bu === undefined) {
        console.warn(`no transport ship buildable units`);
        return;
      }
      if (actions.canAttack) {
        this.eventBus.emit(
          new SendAttackIntentEvent(
            this.gameView.owner(tile).id(),
            this.myPlayer.troops() * this.renderer.uiState.attackRatio,
          ),
        );
      } else if (
        bu.canBuild !== false &&
        this.shouldBoat(tile, bu.canBuild) &&
        this.gameView.isLand(tile)
      ) {
        this.myPlayer
          .bestTransportShipSpawn(this.gameView.ref(cell.x, cell.y))
          .then((spawn: number | false) => {
            if (this.myPlayer === null) throw new Error("not initialized");
            let spawnCell: Cell | null = null;
            if (spawn !== false) {
              spawnCell = new Cell(
                this.gameView.x(spawn),
                this.gameView.y(spawn),
              );
            }
            this.eventBus.emit(
              new SendBoatAttackIntentEvent(
                this.gameView.owner(tile).id(),
                cell,
                this.myPlayer.troops() * this.renderer.uiState.attackRatio,
                spawnCell,
              ),
            );
          });
      }

      const owner = this.gameView.owner(tile);
      if (owner.isPlayer()) {
        this.gameView.setFocusedPlayer(owner as PlayerView);
      } else {
        this.gameView.setFocusedPlayer(null);
      }
    });
  }

  private shouldBoat(tile: TileRef, src: TileRef) {
    // TODO: Global enable flag
    // TODO: Global limit autoboat to nearby shore flag
    // if (!enableAutoBoat) return false;
    // if (!limitAutoBoatNear) return true;
    const distanceSquared = this.gameView.euclideanDistSquared(tile, src);
    const limit = 100;
    const limitSquared = limit * limit;
    if (distanceSquared > limitSquared) return false;
    return true;
  }

  private onMouseMove(event: MouseMoveEvent) {
    this.lastMousePosition = { x: event.x, y: event.y };
    this.checkTileUnderCursor();
  }

  private onBuildingDrop(event: BuildingDropEvent) {
    if (!this.isActive) {
      return;
    }
    
    const cell = this.renderer.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    
    if (!this.gameView.isValidCoord(cell.x, cell.y)) {
      console.log(`Invalid coordinates for drop: ${cell.x}, ${cell.y}`);
      return;
    }
    
    console.log(`Building drop: ${event.unitType} at world coordinates ${cell.x}, ${cell.y}`);
    this.eventBus.emit(new BuildUnitIntentEvent(event.unitType, cell));
  }

  private onHotkeyTransportShip(event: HotkeyTransportShipEvent) {
    if (!this.isActive || !this.myPlayer || !this.myPlayer.isAlive()) {
      console.log("Cannot send transport ship - player not active or alive");
      return;
    }

    // Convert screen coordinates to world coordinates
    const cell = this.renderer.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );

    if (!this.gameView.isValidCoord(cell.x, cell.y)) {
      console.log(`Invalid coordinates for transport ship: ${cell.x}, ${cell.y}`);
      return;
    }

    const tile = this.gameView.ref(cell.x, cell.y);
    
    // Check if target is water - transport ships can only go to land
    if (!this.gameView.isLand(tile)) {
      console.log("Cannot send transport ship to water - please target land");
      return;
    }
    
    const targetOwner = this.gameView.owner(tile);
    
    // Check if we're trying to send to our own territory or ally
    if (targetOwner === this.myPlayer) {
      console.log("Cannot send transport ship to your own territory");
      return;
    }
    
    // Check if we have troops to send
    if (this.myPlayer.troops() <= 0) {
      console.log("No troops available to send");
      return;
    }

    console.log(`Checking if transport ship can reach ${cell.x}, ${cell.y}...`);

    // First check if we can actually send a transport ship to this tile
    this.myPlayer.actions(tile).then((actions) => {
      // Find if transport ship is available in buildable units
      const transportShipAction = actions.buildableUnits.find(
        (bu) => bu.type === UnitType.TransportShip
      );
      
      if (!transportShipAction || transportShipAction.canBuild === false) {
        console.log("Cannot send transport ship to this location");
        console.log("Possible reasons:");
        console.log("1. You don't have any shore tiles (territory next to water)");
        console.log("2. The target cannot be reached by water");
        console.log("3. You've reached the maximum number of transport ships");
        return;
      }

      // We have a valid spawn location from canBuild
      const spawnTile = transportShipAction.canBuild;
      const spawnCell = new Cell(this.gameView.x(spawnTile), this.gameView.y(spawnTile));

      // Send transport ship with current attack ratio
      const troops = Math.floor(this.myPlayer!.troops() * this.renderer.uiState.attackRatio);
      
      this.eventBus.emit(
        new SendBoatAttackIntentEvent(
          targetOwner.id(),
          cell,
          troops,
          spawnCell,
        ),
      );

      console.log(`Successfully sending transport ship from ${spawnCell.x}, ${spawnCell.y} to ${cell.x}, ${cell.y} with ${troops} troops`);
    }).catch((error) => {
      console.error("Error checking transport ship availability:", error);
    });
  }

  private checkTileUnderCursor() {
    if (!this.lastMousePosition || !this.renderer.transformHandler) return;

    const cell = this.renderer.transformHandler.screenToWorldCoordinates(
      this.lastMousePosition.x,
      this.lastMousePosition.y,
    );

    if (!cell || !this.gameView.isValidCoord(cell.x, cell.y)) {
      return;
    }

    const tile = this.gameView.ref(cell.x, cell.y);

    if (this.gameView.isLand(tile)) {
      const owner = this.gameView.owner(tile);
      if (owner.isPlayer()) {
        this.gameView.setFocusedPlayer(owner as PlayerView);
      } else {
        this.gameView.setFocusedPlayer(null);
      }
    } else {
      const units = this.gameView
        .nearbyUnits(tile, 50, [
          UnitType.Viper,
          UnitType.TradeShip,
          UnitType.TransportShip,
        ])
        .sort((a, b) => a.distSquared - b.distSquared)
        .map((u) => u.unit);

      if (units.length > 0) {
        this.gameView.setFocusedPlayer(units[0].owner() as PlayerView);
      } else {
        this.gameView.setFocusedPlayer(null);
      }
    }
  }

  private onConnectionCheck() {
    if (this.transport.isLocal) {
      return;
    }
    const timeSinceLastMessage = Date.now() - this.lastMessageTime;
    if (timeSinceLastMessage > 5000) {
      console.log(
        `No message from server for ${timeSinceLastMessage} ms, reconnecting`,
      );
      this.lastMessageTime = Date.now();
      this.transport.reconnect();
    }
  }
}

function showErrorModal(
  errMsg: string,
  stack: string,
  gameID: GameID,
  clientID: ClientID,
  closable = false,
  heading = "Game crashed!",
) {
  const errorText = `Error: ${errMsg}\nStack: ${stack}`;

  if (document.querySelector("#error-modal")) {
    return;
  }

  const modal = document.createElement("div");
  const content = `${heading}\n game id: ${gameID}, client id: ${clientID}\nPlease paste the following in your bug report in Discord:\n${errorText}`;

  // Create elements
  const pre = document.createElement("pre");
  pre.textContent = content;

  const button = document.createElement("button");
  button.textContent = "Copy to clipboard";
  button.style.cssText =
    "padding: 8px 16px; margin-top: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;";
  button.addEventListener("click", () => {
    navigator.clipboard
      .writeText(content)
      .then(() => (button.textContent = "Copied!"))
      .catch(() => (button.textContent = "Failed to copy"));
  });

  const closeButton = document.createElement("button");
  closeButton.textContent = "X";
  closeButton.style.cssText =
    "color: white;top: 0px;right: 0px;cursor: pointer;background: red;margin-right: 0px;position: fixed;width: 40px;";
  closeButton.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Add to modal
  modal.style.cssText =
    "position:fixed; padding:20px; background:white; border:1px solid black; top:50%; left:50%; transform:translate(-50%,-50%); z-index:9999;";
  modal.appendChild(pre);
  modal.appendChild(button);
  modal.id = "error-modal";
  if (closable) {
    modal.appendChild(closeButton);
  }

  document.body.appendChild(modal);
}
