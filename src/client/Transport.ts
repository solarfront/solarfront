import { SendLogEvent } from "../core/Consolex";
import { EventBus, GameEvent } from "../core/EventBus";
import {
  AllPlayers,
  Cell,
  GameType,
  PlayerID,
  PlayerType,
  Team,
  Tick,
  UnitType,
} from "../core/game/Game";
import { PlayerView } from "../core/game/GameView";
import {
  AllPlayersStats,
  ClientHashMessage,
  ClientID,
  ClientIntentMessage,
  ClientJoinMessage,
  ClientLogMessage,
  ClientPingMessage,
  ClientPlayerDataMessage,
  ClientSendWinnerMessage,
  Intent,
  ServerMessage,
  ServerMessageSchema,
} from "../core/Schemas";
import { LobbyConfig } from "./ClientGameRunner";
import { LocalServer } from "./LocalServer";

export class PauseGameEvent implements GameEvent {
  constructor(public readonly paused: boolean) {}
}

export class SendAllianceRequestIntentEvent implements GameEvent {
  constructor(
    public readonly requestor: PlayerView,
    public readonly recipient: PlayerView,
  ) {}
}

export class SendBreakAllianceIntentEvent implements GameEvent {
  constructor(
    public readonly requestor: PlayerView,
    public readonly recipient: PlayerView,
  ) {}
}

export class SendAllianceReplyIntentEvent implements GameEvent {
  constructor(
    // The original alliance requestor
    public readonly requestor: PlayerView,
    public readonly recipient: PlayerView,
    public readonly accepted: boolean,
  ) {}
}

export class SendSpawnIntentEvent implements GameEvent {
  constructor(public readonly cell: Cell) {}
}

export class SendAttackIntentEvent implements GameEvent {
  constructor(
    public readonly targetID: PlayerID | null,
    public readonly troops: number,
  ) {}
}

export class SendBoatAttackIntentEvent implements GameEvent {
  constructor(
    public readonly targetID: PlayerID | null,
    public readonly dst: Cell,
    public readonly troops: number,
    public readonly src: Cell | null = null,
  ) {}
}

export class BuildUnitIntentEvent implements GameEvent {
  constructor(
    public readonly unit: UnitType,
    public readonly cell: Cell,
  ) {}
}

export class SendTargetPlayerIntentEvent implements GameEvent {
  constructor(public readonly targetID: PlayerID) {}
}

export class SendEmojiIntentEvent implements GameEvent {
  constructor(
    public readonly recipient: PlayerView | typeof AllPlayers,
    public readonly emoji: number,
  ) {}
}

export class SendDonateGoldIntentEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly recipient: PlayerView,
    public readonly gold: number | null,
  ) {}
}

export class SendDonateTroopsIntentEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly recipient: PlayerView,
    public readonly troops: number | null,
  ) {}
}

export class SendQuickChatEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly recipient: PlayerView,
    public readonly quickChatKey: string,
    public readonly variables: { [key: string]: string },
  ) {}
}

export class SendDirectChatEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly recipient: PlayerView,
    public readonly message: string,
  ) {}
}

export class SendAllChatEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly message: string,
  ) {}
}

export class SendEmbargoIntentEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly target: PlayerView,
    public readonly action: "start" | "stop",
  ) {}
}

export class CancelAttackIntentEvent implements GameEvent {
  constructor(
    public readonly playerID: PlayerID,
    public readonly attackID: string,
  ) {}
}

export class SendSetTargetTroopRatioEvent implements GameEvent {
  constructor(public readonly ratio: number) {}
}

export class SendAutoPlayToggleEvent implements GameEvent {
  constructor(
    public readonly enabled: boolean,
    public readonly autoBuild: boolean,
    public readonly autoShip: boolean,
    public readonly autoAttack: boolean,
    public readonly attackRatio?: number, // Current UI attack ratio
  ) {}
}

export class SendAutoPlayAttackRatioUpdateEvent implements GameEvent {
  constructor(
    public readonly attackRatio: number, // New attack ratio from UI
  ) {}
}

export class SendWinnerEvent implements GameEvent {
  constructor(
    public readonly winner: ClientID | Team,
    public readonly allPlayersStats: AllPlayersStats,
    public readonly winnerType: "player" | "team",
  ) {}
}

export class SendPlayerDataEvent implements GameEvent {
  constructor(
    public readonly clientID: ClientID,
    public readonly username: string,
    public readonly tilesOwned: number,
    public readonly tilesWithFallout: number,
    public readonly numLandTiles: number,
    public readonly gold: number,
    public readonly isAlive: boolean,
    public readonly hasSpawned: boolean,
    public readonly troops: number,
    public readonly workers: number,
    public readonly population: number,
    public readonly survivalTime: number,
  ) {}
}

export class SendHashEvent implements GameEvent {
  constructor(
    public readonly tick: Tick,
    public readonly hash: number,
  ) {}
}

export class MoveWarshipIntentEvent implements GameEvent {
  constructor(
    public readonly unitId: number,
    public readonly tile: number,
  ) {}
}

export class BatchMoveWarshipsIntentEvent implements GameEvent {
  constructor(
    public readonly movements: Array<{ unitId: number; targetTile: number }>,
  ) {}
}

export class SendWhisperEvent implements GameEvent {
  constructor(
    public readonly sender: PlayerView,
    public readonly recipient: PlayerView,
    public readonly message: string,
  ) {}
}

export class Transport {
  private socket: WebSocket | null = null;

  private localServer: LocalServer;

  private buffer: string[] = [];

  private onconnect: () => void;
  private onmessage: (msg: ServerMessage) => void;

  private pingInterval: number | null = null;
  public readonly isLocal: boolean;
  constructor(
    private lobbyConfig: LobbyConfig,
    private eventBus: EventBus,
  ) {
    // If gameRecord is not null, we are replaying an archived game.
    // For multiplayer games, GameConfig is not known until game starts.
    this.isLocal =
      lobbyConfig.gameRecord !== undefined ||
      lobbyConfig.gameStartInfo?.config.gameType === GameType.Singleplayer;

    this.eventBus.on(SendAllianceRequestIntentEvent, (e) =>
      this.onSendAllianceRequest(e),
    );
    this.eventBus.on(SendAllianceReplyIntentEvent, (e) =>
      this.onAllianceRequestReplyUIEvent(e),
    );
    this.eventBus.on(SendBreakAllianceIntentEvent, (e) =>
      this.onBreakAllianceRequestUIEvent(e),
    );
    this.eventBus.on(SendSpawnIntentEvent, (e) =>
      this.onSendSpawnIntentEvent(e),
    );
    this.eventBus.on(SendAttackIntentEvent, (e) => this.onSendAttackIntent(e));
    this.eventBus.on(SendBoatAttackIntentEvent, (e) =>
      this.onSendBoatAttackIntent(e),
    );
    this.eventBus.on(SendTargetPlayerIntentEvent, (e) =>
      this.onSendTargetPlayerIntent(e),
    );
    this.eventBus.on(SendEmojiIntentEvent, (e) => this.onSendEmojiIntent(e));
    this.eventBus.on(SendDonateGoldIntentEvent, (e) =>
      this.onSendDonateGoldIntent(e),
    );
    this.eventBus.on(SendDonateTroopsIntentEvent, (e) =>
      this.onSendDonateTroopIntent(e),
    );
    this.eventBus.on(SendQuickChatEvent, (e) => this.onSendQuickChatIntent(e));
    this.eventBus.on(SendDirectChatEvent, (e) =>
      this.onSendDirectChatIntent(e),
    );
    this.eventBus.on(SendAllChatEvent, (e) => this.onSendAllChatIntent(e));
    this.eventBus.on(SendEmbargoIntentEvent, (e) =>
      this.onSendEmbargoIntent(e),
    );
    this.eventBus.on(SendSetTargetTroopRatioEvent, (e) =>
      this.onSendSetTargetTroopRatioEvent(e),
    );
    this.eventBus.on(SendAutoPlayToggleEvent, (e) =>
      this.onSendAutoPlayToggleEvent(e),
    );
    this.eventBus.on(SendAutoPlayAttackRatioUpdateEvent, (e) =>
      this.onSendAutoPlayAttackRatioUpdateEvent(e),
    );
    this.eventBus.on(BuildUnitIntentEvent, (e) => this.onBuildUnitIntent(e));

    this.eventBus.on(SendLogEvent, (e) => this.onSendLogEvent(e));
    this.eventBus.on(PauseGameEvent, (e) => this.onPauseGameEvent(e));
    this.eventBus.on(SendWinnerEvent, (e) => this.onSendWinnerEvent(e));
    this.eventBus.on(SendPlayerDataEvent, (e) => this.onSendPlayerDataEvent(e));
    this.eventBus.on(SendHashEvent, (e) => this.onSendHashEvent(e));
    this.eventBus.on(CancelAttackIntentEvent, (e) =>
      this.onCancelAttackIntentEvent(e),
    );
    this.eventBus.on(MoveWarshipIntentEvent, (e) => {
      this.onMoveWarshipEvent(e);
    });
    this.eventBus.on(BatchMoveWarshipsIntentEvent, (e) => {
      this.onBatchMoveWarshipsEvent(e);
    });
    this.eventBus.on(SendWhisperEvent, (e) => this.onSendWhisperIntent(e));
  }

  private startPing() {
    if (this.isLocal || this.pingInterval) return;
    if (this.pingInterval === null) {
      this.pingInterval = window.setInterval(() => {
        if (this.socket !== null && this.socket.readyState === WebSocket.OPEN) {
          this.sendMsg(
            JSON.stringify({
              type: "ping",
            } satisfies ClientPingMessage),
          );
        }
      }, 5 * 1000);
    }
  }

  private stopPing() {
    if (this.pingInterval) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public connect(
    onconnect: () => void,
    onmessage: (message: ServerMessage) => void,
  ) {
    if (this.isLocal) {
      this.connectLocal(onconnect, onmessage);
    } else {
      this.connectRemote(onconnect, onmessage);
    }
  }

  private connectLocal(
    onconnect: () => void,
    onmessage: (message: ServerMessage) => void,
  ) {
    this.localServer = new LocalServer(
      this.lobbyConfig,
      onconnect,
      onmessage,
      this.lobbyConfig.gameRecord !== undefined,
    );
    this.localServer.start();
  }

  private connectRemote(
    onconnect: () => void,
    onmessage: (message: ServerMessage) => void,
  ) {
    this.startPing();
    this.killExistingSocket();
    const baseWs =
      process.env.WEBSOCKET_URL ??
      (window.location.protocol === "https:"
        ? "wss://" + window.location.host
        : "ws://" + window.location.host);
    const workerPath = this.lobbyConfig.serverConfig.workerPath(
      this.lobbyConfig.gameID,
    );
    this.socket = new WebSocket(`${baseWs}/${workerPath}`);
    this.onconnect = onconnect;
    this.onmessage = onmessage;
    this.socket.onopen = () => {
      console.log("Connected to game server!");
      while (this.buffer.length > 0) {
        console.log("sending dropped message");
        const msg = this.buffer.pop();
        if (msg === undefined) {
          console.warn("msg is undefined");
          continue;
        }
        this.sendMsg(msg);
      }
      onconnect();
    };
    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const serverMsg = ServerMessageSchema.parse(JSON.parse(event.data));
        this.onmessage(serverMsg);
      } catch (error) {
        console.error(
          `Failed to process server message ${event.data}: ${error}, ${error.stack}`,
        );
      }
    };
    this.socket.onerror = (err) => {
      console.error("Socket encountered error: ", err, "Closing socket");
      if (this.socket === null) return;
      this.socket.close();
    };
    this.socket.onclose = (event: CloseEvent) => {
      console.log(
        `WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`,
      );
      if (event.code !== 1000) {
        console.log(`reconnecting`);
        this.reconnect();
      }
    };
  }

  public reconnect() {
    this.connect(this.onconnect, this.onmessage);
  }

  public turnComplete() {
    if (this.isLocal) {
      this.localServer.turnComplete();
    }
  }

  private onSendLogEvent(event: SendLogEvent) {
    this.sendMsg(
      JSON.stringify({
        type: "log",
        log: event.log,
        severity: event.severity,
      } satisfies ClientLogMessage),
    );
  }

  joinGame(numTurns: number) {
    this.sendMsg(
      JSON.stringify({
        type: "join",
        gameID: this.lobbyConfig.gameID,
        clientID: this.lobbyConfig.clientID,
        lastTurn: numTurns,
        token: this.lobbyConfig.token,
        username: this.lobbyConfig.playerName,
        flag: this.lobbyConfig.flag,
        walletAddress: this.lobbyConfig.walletAddress || null,
      } satisfies ClientJoinMessage),
    );
  }

  leaveGame(saveFullGame: boolean = false) {
    if (this.isLocal) {
      this.localServer.endGame(saveFullGame);
      return;
    }
    this.stopPing();
    if (this.socket === null) return;
    if (this.socket.readyState === WebSocket.OPEN) {
      console.log("on stop: leaving game");
      this.socket.close();
    } else {
      console.log(
        "WebSocket is not open. Current state:",
        this.socket.readyState,
      );
      console.error("attempting reconnect");
    }
    this.socket.onclose = (event: CloseEvent) => {};
  }

  private onSendAllianceRequest(event: SendAllianceRequestIntentEvent) {
    this.sendIntent({
      type: "allianceRequest",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
    });
  }

  private onAllianceRequestReplyUIEvent(event: SendAllianceReplyIntentEvent) {
    this.sendIntent({
      type: "allianceRequestReply",
      clientID: this.lobbyConfig.clientID,
      requestor: event.requestor.id(),
      accept: event.accepted,
    });
  }

  private onBreakAllianceRequestUIEvent(event: SendBreakAllianceIntentEvent) {
    this.sendIntent({
      type: "breakAlliance",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
    });
  }

  private onSendSpawnIntentEvent(event: SendSpawnIntentEvent) {
    this.sendIntent({
      type: "spawn",
      clientID: this.lobbyConfig.clientID,
      flag: this.lobbyConfig.flag,
      name: this.lobbyConfig.playerName,
      playerType: PlayerType.Human,
      x: event.cell.x,
      y: event.cell.y,
    });
  }

  private onSendAttackIntent(event: SendAttackIntentEvent) {
    this.sendIntent({
      type: "attack",
      clientID: this.lobbyConfig.clientID,
      targetID: event.targetID,
      troops: event.troops,
    });
  }

  private onSendBoatAttackIntent(event: SendBoatAttackIntentEvent) {
    this.sendIntent({
      type: "boat",
      clientID: this.lobbyConfig.clientID,
      targetID: event.targetID,
      troops: event.troops,
      dstX: event.dst.x,
      dstY: event.dst.y,
      srcX: event.src?.x ?? null,
      srcY: event.src?.y ?? null,
    });
  }

  private onSendTargetPlayerIntent(event: SendTargetPlayerIntentEvent) {
    this.sendIntent({
      type: "targetPlayer",
      clientID: this.lobbyConfig.clientID,
      target: event.targetID,
    });
  }

  private onSendEmojiIntent(event: SendEmojiIntentEvent) {
    this.sendIntent({
      type: "emoji",
      clientID: this.lobbyConfig.clientID,
      recipient:
        event.recipient === AllPlayers ? AllPlayers : event.recipient.id(),
      emoji: event.emoji,
    });
  }

  private onSendDonateGoldIntent(event: SendDonateGoldIntentEvent) {
    this.sendIntent({
      type: "donate_gold",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
      gold: event.gold,
    });
  }

  private onSendDonateTroopIntent(event: SendDonateTroopsIntentEvent) {
    this.sendIntent({
      type: "donate_troops",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
      troops: event.troops,
    });
  }

  private onSendQuickChatIntent(event: SendQuickChatEvent) {
    this.sendIntent({
      type: "quick_chat",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
      quickChatKey: event.quickChatKey,
      variables: event.variables,
    });
  }

  private onSendDirectChatIntent(event: SendDirectChatEvent) {
    this.sendIntent({
      type: "direct_chat",
      clientID: this.lobbyConfig.clientID,
      recipient: event.recipient.id(),
      message: event.message,
    });
  }

  private onSendAllChatIntent(event: SendAllChatEvent) {
    this.sendIntent({
      type: "all_chat",
      clientID: this.lobbyConfig.clientID,
      message: event.message,
    });
  }

  private onSendEmbargoIntent(event: SendEmbargoIntentEvent) {
    this.sendIntent({
      type: "embargo",
      clientID: this.lobbyConfig.clientID,
      targetID: event.target.id(),
      action: event.action,
    });
  }

  private onSendSetTargetTroopRatioEvent(event: SendSetTargetTroopRatioEvent) {
    this.sendIntent({
      type: "troop_ratio",
      clientID: this.lobbyConfig.clientID,
      ratio: event.ratio,
    });
  }

  private onSendAutoPlayToggleEvent(event: SendAutoPlayToggleEvent) {
    this.sendIntent({
      type: "auto_play_toggle",
      clientID: this.lobbyConfig.clientID,
      enabled: event.enabled,
      autoBuild: event.autoBuild,
      autoShip: event.autoShip,
      autoAttack: event.autoAttack,
      attackRatio: event.attackRatio, // Pass current UI attack ratio
    });
  }

  private onSendAutoPlayAttackRatioUpdateEvent(event: SendAutoPlayAttackRatioUpdateEvent) {
    this.sendIntent({
      type: "auto_play_attack_ratio_update",
      clientID: this.lobbyConfig.clientID,
      attackRatio: event.attackRatio, // Pass new attack ratio
    });
  }

  private onBuildUnitIntent(event: BuildUnitIntentEvent) {
    console.log(`Transport.onBuildUnitIntent called for ${event.unit} at ${event.cell.x}, ${event.cell.y}`);
    this.sendIntent({
      type: "build_unit",
      clientID: this.lobbyConfig.clientID,
      unit: event.unit,
      x: event.cell.x,
      y: event.cell.y,
    });
  }

  private onPauseGameEvent(event: PauseGameEvent) {
    if (!this.isLocal) {
      console.log(`cannot pause multiplayer games`);
      return;
    }
    if (event.paused) {
      this.localServer.pause();
    } else {
      this.localServer.resume();
    }
  }

  private onSendWinnerEvent(event: SendWinnerEvent) {
    if (this.isLocal || this.socket?.readyState === WebSocket.OPEN) {
      const msg = {
        type: "winner",
        winner: event.winner,
        allPlayersStats: event.allPlayersStats,
        winnerType: event.winnerType,
      } satisfies ClientSendWinnerMessage;
      this.sendMsg(JSON.stringify(msg));
    } else {
      console.log(
        "WebSocket is not open. Current state:",
        this.socket?.readyState,
      );
      console.log("attempting reconnect");
    }
  }

  private onSendPlayerDataEvent(event: SendPlayerDataEvent) {
    if (this.socket === null) return;
    if (this.isLocal || this.socket.readyState === WebSocket.OPEN) {
      this.sendMsg(
        JSON.stringify({
          type: "playerdata",
          clientID: event.clientID,
          username: event.username,
          tilesOwned: event.tilesOwned,
          tilesWithFallout: event.tilesWithFallout,
          numLandTiles: event.numLandTiles,
          gold: event.gold,
          isAlive: event.isAlive,
          hasSpawned: event.hasSpawned,
          troops: event.troops,
          workers: event.workers,
          population: event.population,
          survivalTime: event.survivalTime,
        } satisfies ClientPlayerDataMessage),
      );
    } else {
      console.log(
        "WebSocket is not open. Current state:",
        this.socket.readyState,
      );
      console.log("attempting reconnect");
    }
  }

  private onSendHashEvent(event: SendHashEvent) {
    if (this.socket === null) return;
    if (this.isLocal || this.socket.readyState === WebSocket.OPEN) {
      this.sendMsg(
        JSON.stringify({
          type: "hash",
          turnNumber: event.tick,
          hash: event.hash,
        } satisfies ClientHashMessage),
      );
    } else {
      console.log(
        "WebSocket is not open. Current state:",
        this.socket.readyState,
      );
      console.log("attempting reconnect");
    }
  }

  private onCancelAttackIntentEvent(event: CancelAttackIntentEvent) {
    this.sendIntent({
      type: "cancel_attack",
      clientID: this.lobbyConfig.clientID,
      attackID: event.attackID,
    });
  }

  private onMoveWarshipEvent(event: MoveWarshipIntentEvent) {
    this.sendIntent({
      type: "move_warship",
      clientID: this.lobbyConfig.clientID,
      unitId: event.unitId,
      tile: event.tile,
    });
  }

  private onBatchMoveWarshipsEvent(event: BatchMoveWarshipsIntentEvent) {
    this.sendIntent({
      type: "batch_move_warships",
      clientID: this.lobbyConfig.clientID,
      movements: event.movements,
    });
  }

  private onSendWhisperIntent(event: SendWhisperEvent) {
    this.sendIntent({
      type: "whisper",
      clientID: this.lobbyConfig.clientID,
      sender: event.sender.id(),
      recipient: event.recipient.id(),
      message: event.message,
    });
  }

  private sendIntent(intent: Intent) {
    if (this.isLocal || this.socket?.readyState === WebSocket.OPEN) {
      const msg = {
        type: "intent",
        intent: intent,
      } satisfies ClientIntentMessage;
      this.sendMsg(JSON.stringify(msg));
    } else {
      console.log(
        "WebSocket is not open. Current state:",
        this.socket?.readyState,
      );
      console.log("attempting reconnect");
    }
  }

  private sendMsg(msg: string) {
    if (this.isLocal) {
      this.localServer.onMessage(msg);
    } else {
      if (this.socket === null) return;
      if (
        this.socket.readyState === WebSocket.CLOSED ||
        this.socket.readyState === WebSocket.CLOSED
      ) {
        console.warn("socket not ready, closing and trying later");
        this.socket.close();
        this.socket = null;
        this.connectRemote(this.onconnect, this.onmessage);
        this.buffer.push(msg);
      } else {
        this.socket.send(msg);
      }
    }
  }

  private killExistingSocket(): void {
    if (this.socket === null) {
      return;
    }
    // Remove all event listeners
    this.socket.onmessage = null;
    this.socket.onopen = null;
    this.socket.onclose = null;
    this.socket.onerror = null;

    // Close the connection if it's still open
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
  }
}
