import { consolex } from "../Consolex";
import { Execution, Game, Player, PlayerID } from "../game/Game";

export class DirectChatExecution implements Execution {
  private sender: Player;
  private recipient: Player;
  private mg: Game;

  private active = true;

  constructor(
    private senderID: PlayerID,
    private recipientID: PlayerID,
    private message: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.senderID)) {
      consolex.warn(`DirectChatExecution: sender ${this.senderID} not found`);
      this.active = false;
      return;
    }
    if (!mg.hasPlayer(this.recipientID)) {
      consolex.warn(
        `DirectChatExecution: recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }

    this.sender = mg.player(this.senderID);
    this.recipient = mg.player(this.recipientID);
  }

  tick(ticks: number): void {
    // Display the message to the recipient
    this.mg.displayChat(
      "direct_chat",
      "message",
      { message: this.message },
      this.recipient.id(),
      true,
      this.recipient.name(),
    );

    // Display the message to the sender (as confirmation)
    this.mg.displayChat(
      "direct_chat",
      "message",
      { message: this.message },
      this.sender.id(),
      false,
      this.recipient.name(),
    );

    consolex.log(
      `[DirectChat] ${this.sender.name} → ${this.recipient.name}: ${this.message}`,
    );

    this.active = false;
  }

  owner(): Player {
    return this.sender;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
