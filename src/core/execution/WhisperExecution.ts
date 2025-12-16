import { consolex } from "../Consolex";
import { Execution, Game, Player, PlayerID } from "../game/Game";

export class WhisperExecution implements Execution {
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
      consolex.warn(`WhisperExecution: sender ${this.senderID} not found`);
      this.active = false;
      return;
    }
    if (!mg.hasPlayer(this.recipientID)) {
      consolex.warn(
        `WhisperExecution: recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }
    this.sender = mg.player(this.senderID);
    this.recipient = mg.player(this.recipientID);
  }

  tick(ticks: number): void {
    // Display the whisper to the recipient
    this.mg.displayChat(
      "message",
      "whisper",
      {
        message: this.message,
        senderName: this.sender.name(),
        senderId: this.sender.id(),
      },
      this.recipient.id(),
      true,
      this.recipient.name(),
    );

    // Display the whisper to the sender (as confirmation)
    this.mg.displayChat(
      "message_sent",
      "whisper",
      {
        message: this.message,
        recipientName: this.recipient.name(),
        recipientId: this.recipient.id(),
      },
      this.sender.id(),
      false,
      this.sender.name(),
    );

    consolex.log(
      `[Whisper] ${this.sender.name()} → ${this.recipient.name()}: ${this.message}`,
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
    return true; // Allow whispers during spawn phase
  }
}
