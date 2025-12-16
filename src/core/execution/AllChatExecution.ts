import { consolex } from "../Consolex";
import { Execution, Game, Player, PlayerID } from "../game/Game";

export class AllChatExecution implements Execution {
  private sender: Player;
  private mg: Game;
  private active = true;

  constructor(
    private senderID: PlayerID,
    private message: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.senderID)) {
      consolex.warn(`AllChatExecution: sender ${this.senderID} not found`);
      this.active = false;
      return;
    }
    this.sender = mg.player(this.senderID);
  }

  tick(ticks: number): void {
    this.mg.displayChat(
      "message",
      "all_chat",
      {
        message: this.message,
        senderName: this.sender.name(),
        senderId: this.sender.id(),
      },
      null, // Use null playerID for a broadcast message
      false,
      "All",
    );

    consolex.log(`[AllChat] ${this.sender.name()}: ${this.message}`);
    this.active = false;
  }

  owner(): Player {
    return this.sender;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true; // Allow chat during spawn phase
  }
}
