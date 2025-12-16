import { LitElement, html } from "lit";
import { customElement, query } from "lit/decorators.js";

import { EventBus } from "../../../core/EventBus";
import { PlayerType } from "../../../core/game/Game";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { SendDirectChatEvent } from "../../Transport";

@customElement("chat-modal")
export class ChatModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @query("#chat-input") private chatInputEl!: HTMLInputElement;

  createRenderRoot() {
    return this;
  }

  private players: string[] = [];
  private playerSearchQuery: string = "";
  private selectedPlayer: string | null = null;
  private message: string = "";

  private recipient: PlayerView;
  private sender: PlayerView;
  public eventBus: EventBus;
  public g: GameView;

  render() {
    const sortedPlayers = [...this.players].sort((a, b) => a.localeCompare(b));
    const filteredPlayers = sortedPlayers.filter((player) =>
      player.toLowerCase().includes(this.playerSearchQuery.toLowerCase()),
    );

    return html`
      <o-modal title="Send Message">
        <div class="chat-container">
          <div class="chat-section">
            <div class="section-title">Select Player:</div>
            <input
              class="player-search-input"
              type="text"
              placeholder="Search player..."
              .value=${this.playerSearchQuery}
              @input=${this.onPlayerSearchInput}
            />
            <div class="player-list">
              ${filteredPlayers.map(
                (player) => html`
                  <button
                    class="player-button ${this.selectedPlayer === player
                      ? "selected"
                      : ""}"
                    @click=${() => this.selectPlayer(player)}
                  >
                    ${player}
                  </button>
                `,
              )}
            </div>
          </div>

          <div class="chat-section">
            <div class="section-title">Your Message:</div>
            <textarea
              id="chat-input"
              class="message-input"
              placeholder="Type your message here..."
              .value=${this.message}
              @input=${this.onMessageInput}
              @keydown=${this.onKeyDown}
              maxlength="200"
            ></textarea>
            <div class="character-counter">${this.message.length}/200</div>
          </div>

          <div class="chat-preview">
            ${this.selectedPlayer && this.message
              ? html`<strong>To ${this.selectedPlayer}:</strong> ${this.message}`
              : this.selectedPlayer && !this.message
                ? html`Select a player and type a message...`
                : !this.selectedPlayer && this.message
                  ? html`Select a player to send to...`
                  : html`Select a player and type a message...`}
          </div>

          <div class="chat-actions">
            <button
              class="send-button"
              @click=${this.sendMessage}
              ?disabled=${!this.selectedPlayer || !this.message.trim()}
            >
              Send Message
            </button>
            <button class="cancel-button" @click=${this.close}>Cancel</button>
          </div>
        </div>
      </o-modal>

      <style>
        .chat-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 400px;
          max-width: 500px;
        }

        .chat-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-title {
          font-weight: bold;
          font-size: 14px;
          color: #333;
        }

        .player-search-input {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }

        .player-list {
          max-height: 150px;
          overflow-y: auto;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: #f9f9f9;
        }

        .player-button {
          width: 100%;
          padding: 8px 12px;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          border-bottom: 1px solid #eee;
        }

        .player-button:hover {
          background: #e9e9e9;
        }

        .player-button.selected {
          background: #007bff;
          color: white;
        }

        .player-button:last-child {
          border-bottom: none;
        }

        .message-input {
          width: 100%;
          min-height: 80px;
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
        }

        .character-counter {
          font-size: 12px;
          color: #666;
          text-align: right;
        }

        .chat-preview {
          padding: 12px;
          background: #f0f0f0;
          border-radius: 4px;
          font-style: italic;
          min-height: 20px;
        }

        .chat-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .send-button {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .send-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .send-button:not(:disabled):hover {
          background: #0056b3;
        }

        .cancel-button {
          padding: 10px 20px;
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .cancel-button:hover {
          background: #545b62;
        }
      </style>
    `;
  }

  private onPlayerSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    this.playerSearchQuery = target.value;
    this.requestUpdate();
  }

  private selectPlayer(player: string) {
    this.selectedPlayer = player;
    this.requestUpdate();
  }

  private onMessageInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.message = target.value;
    this.requestUpdate();
  }

  private onKeyDown(e: KeyboardEvent) {
    // Send message on Ctrl+Enter
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      if (this.selectedPlayer && this.message.trim()) {
        this.sendMessage();
      }
    }
  }

  private sendMessage() {
    if (!this.sender || !this.recipient || !this.message.trim()) {
      return;
    }

    // Find the selected player view
    const selectedPlayerView = this.g
      .players()
      .find((p) => p.data.name === this.selectedPlayer);

    if (!selectedPlayerView) {
      console.error("Selected player not found");
      return;
    }

    console.log("Sending direct message:", {
      sender: this.sender.data.name,
      recipient: selectedPlayerView.data.name,
      message: this.message,
    });

    this.eventBus.emit(
      new SendDirectChatEvent(this.sender, selectedPlayerView, this.message),
    );

    this.close();
  }

  public open(sender?: PlayerView, recipient?: PlayerView) {
    if (sender) {
      this.sender = sender;

      // Get all alive players except the sender
      const alivePlayerNames = this.g
        .players()
        .filter(
          (p) =>
            p.isAlive() &&
            !(p.data.playerType === PlayerType.Bot) &&
            p.data.name !== sender.data.name,
        )
        .map((p) => p.data.name);

      this.players = alivePlayerNames;

      // If a specific recipient is provided, select them
      if (recipient) {
        this.recipient = recipient;
        this.selectedPlayer = recipient.data.name;
      }
    }

    this.requestUpdate();
    this.modalEl?.open();

    // Focus the message input after the modal opens
    setTimeout(() => {
      this.chatInputEl?.focus();
    }, 100);
  }

  public close() {
    this.selectedPlayer = null;
    this.message = "";
    this.playerSearchQuery = "";
    this.modalEl?.close();
    this.requestUpdate();
  }

  public setRecipient(value: PlayerView) {
    this.recipient = value;
    this.selectedPlayer = value.data.name;
    this.requestUpdate();
  }

  public setSender(value: PlayerView) {
    this.sender = value;
  }
}
