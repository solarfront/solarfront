import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DirectiveResult } from "lit/directive.js";
import { unsafeHTML, UnsafeHTMLDirective } from "lit/directives/unsafe-html.js";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import { PlayerType } from "../../../core/game/Game";
import {
  DisplayChatMessageUpdate,
  GameUpdateType,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { onlyImages } from "../../../core/Util";
import { SendAllChatEvent, SendWhisperEvent } from "../../Transport";
import { Layer } from "./Layer";

interface ChatEvent {
  description: string;
  unsafeDescription?: boolean;
  createdAt: number;
  highlight?: boolean;
  avatar?: string;
  senderName?: string;
  senderColor?: string;
  variables?: Record<string, string>;
  context?: "all" | string;
  senderId?: string;
}

interface ChatTab {
  id: string;
  name: string;
  isFlashing: boolean;
  hasUnread: boolean;
}

interface ContextMenu {
  visible: boolean;
  x: number;
  y: number;
  targetPlayerId?: string;
  targetPlayerName?: string;
}

interface FloodDetection {
  lastMessageTime: number;
  messageCount: number;
  muteUntil: number;
  muteLevel: number; // 0, 1, 2, 3 for escalating penalties
}

@customElement("chat-display")
export class ChatDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: GameView;
  public clientID: ClientID;

  private active: boolean = false;

  @state() private _hidden: boolean = true;
  @state() private chatInput: string = "";
  @state() private newEvents: number = 0;
  @state() private chatEvents: ChatEvent[] = [];
  @state() private chatWidth: number = 288;
  @state() private chatHeight: number = 250;
  @state() private chatX: number = 338;
  @state() private chatY: number = window.innerHeight - 260; // Position from top instead of bottom
  @state() private tabs: ChatTab[] = [
    { id: "all", name: "All Chat", isFlashing: false, hasUnread: false },
  ];
  @state() private activeTab: string = "all";
  @state() private blockedUsers: Set<string> = new Set();
  @state() private contextMenu: ContextMenu = { visible: false, x: 0, y: 0 };

  private isResizing: boolean = false;
  private isDragging: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartY: number = 0;
  private resizeStartWidth: number = 0;
  private resizeStartHeight: number = 0;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartChatX: number = 0;
  private dragStartChatY: number = 0;
  private flashIntervals: Map<string, number> = new Map();
  private floodDetection: Map<string, FloodDetection> = new Map();

  private toggleHidden() {
    this._hidden = !this._hidden;
    if (!this._hidden) {
      this.newEvents = 0;
      const activeTabObj = this.tabs.find((t) => t.id === this.activeTab);
      if (activeTabObj) {
        activeTabObj.hasUnread = false;
        this.stopFlashing(activeTabObj.id);
      }
      setTimeout(() => {
        const input = this.querySelector(".chat-input") as HTMLInputElement;
        input?.focus();
      }, 0);
    }
    this.requestUpdate();
  }

  private startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartWidth = this.chatWidth;
    this.resizeStartHeight = this.chatHeight;
    this.dragStartChatY = this.chatY; // Store initial Y position for resize

    document.addEventListener("mousemove", this.handleResize);
    document.addEventListener("mouseup", this.stopResize);
    document.body.style.cursor = "ne-resize";
    document.body.style.userSelect = "none";
  }

  private handleResize = (e: MouseEvent) => {
    if (!this.isResizing) return;

    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;

    const newWidth = Math.max(130, this.resizeStartWidth + deltaX);
    const newHeight = Math.max(130, this.resizeStartHeight - deltaY);

    // Constrain to viewport bounds
    const maxWidth = Math.min(600, window.innerWidth - 20); // Max 600px or window width - 20px margin
    const maxHeight = Math.min(500, window.innerHeight - 100); // Max 500px or window height - 100px margin

    const constrainedHeight = Math.min(newHeight, maxHeight);
    const heightDiff = constrainedHeight - this.resizeStartHeight;

    // Adjust Y position so the bottom stays fixed while the top moves
    this.chatY = this.dragStartChatY - heightDiff;
    
    // Make sure chat stays within viewport bounds
    this.chatY = Math.max(10, this.chatY);
    
    this.chatWidth = Math.min(newWidth, maxWidth);
    this.chatHeight = constrainedHeight;
    this.requestUpdate();
  };

  private stopResize = () => {
    this.isResizing = false;
    document.removeEventListener("mousemove", this.handleResize);
    document.removeEventListener("mouseup", this.stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  private startDrag = (e: MouseEvent) => {
    // Don't start drag if clicking on buttons or resize handle
    if ((e.target as HTMLElement).classList.contains("hide-button") ||
        (e.target as HTMLElement).classList.contains("resize-handle")) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartChatX = this.chatX;
    this.dragStartChatY = this.chatY;

    document.addEventListener("mousemove", this.handleDrag);
    document.addEventListener("mouseup", this.stopDrag);
    document.body.style.cursor = "move";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  private handleDrag = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    // Calculate new position
    let newX = this.dragStartChatX + deltaX;
    let newY = this.dragStartChatY + deltaY;

    // Keep chat box within viewport bounds (with 10px margin)
    const maxX = window.innerWidth - this.chatWidth - 10;
    const maxY = window.innerHeight - this.chatHeight - 10;

    newX = Math.max(10, Math.min(newX, maxX));
    newY = Math.max(10, Math.min(newY, maxY));

    this.chatX = newX;
    this.chatY = newY;
  };

  private stopDrag = () => {
    this.isDragging = false;
    document.removeEventListener("mousemove", this.handleDrag);
    document.removeEventListener("mouseup", this.stopDrag);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  private hideContextMenu = () => {
    this.contextMenu = { visible: false, x: 0, y: 0 };
    this.requestUpdate();
  };

  private showContextMenu(e: MouseEvent, playerId: string, playerName: string) {
    e.preventDefault();
    e.stopPropagation();

    // Don't show context menu if current player is dead
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (myPlayer && !myPlayer.isAlive()) {
      return;
    }

    this.contextMenu = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetPlayerId: playerId,
      targetPlayerName: playerName,
    };

    // Hide context menu when clicking elsewhere
    setTimeout(() => {
      document.addEventListener("click", this.hideContextMenu, { once: true });
    }, 0);

    this.requestUpdate();
  }

  private blockUser(playerId: string) {
    this.blockedUsers.add(playerId);
    this.hideContextMenu();
    this.addSystemMessage(
      `Blocked user. You will no longer see their messages.`,
    );
    this.requestUpdate();
  }

  private unblockUser(playerId: string) {
    this.blockedUsers.delete(playerId);
    this.hideContextMenu();
    this.addSystemMessage(`User unblocked.`);
    this.requestUpdate();
  }

  private whisperUser(playerId: string, playerName: string) {
    this.hideContextMenu();
    this.openWhisperTab(playerId, playerName);
  }

  private addSystemMessage(message: string) {
    this.addEvent({
      description: message,
      createdAt: this.game.ticks(),
      highlight: false,
      unsafeDescription: false,
      senderColor: "#888888",
      senderName: "System",
      context: "all",
    });
  }

  private checkFloodProtection(playerId: string): boolean {
    const now = Date.now();
    const playerFlood = this.floodDetection.get(playerId) || {
      lastMessageTime: 0,
      messageCount: 0,
      muteUntil: 0,
      muteLevel: 0,
    };

    // Check if player is currently muted
    if (now < playerFlood.muteUntil) {
      return false; // Blocked due to mute
    }

    // Reset message count if enough time has passed (5 seconds)
    if (now - playerFlood.lastMessageTime > 5000) {
      playerFlood.messageCount = 0;
      playerFlood.muteLevel = Math.max(0, playerFlood.muteLevel - 1); // Reduce mute level over time
    }

    playerFlood.messageCount++;
    playerFlood.lastMessageTime = now;

    // Check for flood (more than 4 messages in 5 seconds)
    if (playerFlood.messageCount > 4) {
      // Escalating penalties: 30s, 45s, 1min, 10min
      const muteDurations = [30000, 45000, 60000, 600000];
      const muteDuration =
        muteDurations[
          Math.min(playerFlood.muteLevel, muteDurations.length - 1)
        ];

      playerFlood.muteUntil = now + muteDuration;
      playerFlood.muteLevel++;
      playerFlood.messageCount = 0;

      this.floodDetection.set(playerId, playerFlood);

      const muteText =
        muteDuration >= 60000
          ? `${Math.round(muteDuration / 60000)} minute${muteDuration > 60000 ? "s" : ""}`
          : `${muteDuration / 1000} seconds`;

      this.addSystemMessage(
        `You are sending messages too quickly. Muted for ${muteText}.`,
      );
      return false;
    }

    this.floodDetection.set(playerId, playerFlood);
    return true;
  }

  private filterAndProcessLinks(message: string): string {
    // Discord invite pattern
    const discordPattern = /(https?:\/\/)?(discord\.gg\/[a-zA-Z0-9]+)/gi;

    // Generic URL pattern to catch other links
    const urlPattern =
      /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;

    let processedMessage = message;

    // First, replace Discord links with clickable versions
    processedMessage = processedMessage.replace(
      discordPattern,
      (match, protocol, discordPart) => {
        const fullUrl = protocol ? match : `https://${discordPart}`;
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color: #7289da; text-decoration: underline;">${discordPart}</a>`;
      },
    );

    // Then remove any other URLs that aren't Discord links
    processedMessage = processedMessage.replace(urlPattern, (match) => {
      // Skip if it's already a Discord link (contains <a href)
      if (match.includes("<a href") || match.includes("discord.gg")) {
        return match;
      }
      return "[Link Removed]";
    });

    return processedMessage;
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this.isResizing) {
      this.stopResize();
    }
    if (this.isDragging) {
      this.stopDrag();
    }
    this.flashIntervals.forEach((interval) => clearInterval(interval));
    this.flashIntervals.clear();

    // Clean up context menu listener
    document.removeEventListener("click", this.hideContextMenu);

    // Clean up window resize listener
    window.removeEventListener("resize", this.handleWindowResize);
  }

  private addEvent(event: ChatEvent) {
    // Skip messages from blocked users
    if (event.senderId && this.blockedUsers.has(event.senderId)) {
      return;
    }

    if (this.chatEvents.length >= 50) {
      this.chatEvents.shift();
    }
    this.chatEvents = [...this.chatEvents, event];

    if (event.context && event.context !== "all") {
      const otherPlayerId = event.context;

      // Only create tabs for incoming messages, not outgoing confirmations
      if (event.senderName !== "You") {
        const otherPlayer = this.game.player(otherPlayerId);
        if (otherPlayer) {
          this.ensureWhisperTab(otherPlayerId, otherPlayer.name());

          // Only flash for incoming messages when the tab is not active
          if (this.activeTab !== otherPlayerId || this._hidden) {
            const tab = this.tabs.find((t) => t.id === otherPlayerId);
            if (tab) {
              tab.hasUnread = true;
              this.startFlashing(tab.id);
            }
          }
        }
      }
    }

    if (this._hidden) {
      this.newEvents++;
    }
    setTimeout(() => {
      const messagesContainer = this.querySelector(".chat-messages");
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 0);
    this.requestUpdate();
  }

  private ensureWhisperTab(playerId: string, playerName: string) {
    if (!this.tabs.find((t) => t.id === playerId)) {
      this.tabs = [
        ...this.tabs,
        {
          id: playerId,
          name: playerName,
          isFlashing: false,
          hasUnread: false,
        },
      ];
    }
  }

  private startFlashing(tabId: string) {
    if (this.flashIntervals.has(tabId)) return;

    const interval = window.setInterval(() => {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab && tab.hasUnread) {
        tab.isFlashing = !tab.isFlashing;
        this.requestUpdate();
      } else {
        this.stopFlashing(tabId);
      }
    }, 700);

    this.flashIntervals.set(tabId, interval);
  }

  private stopFlashing(tabId: string) {
    const interval = this.flashIntervals.get(tabId);
    if (interval) {
      clearInterval(interval);
      this.flashIntervals.delete(tabId);
    }
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      tab.isFlashing = false;
    }
  }

  private switchTab(tabId: string) {
    this.activeTab = tabId;
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      tab.hasUnread = false;
      this.stopFlashing(tabId);
    }
    this.requestUpdate();
  }

  private closeTab(tabId: string, e: Event) {
    e.stopPropagation();
    if (tabId === "all") return;

    this.tabs = this.tabs.filter((t) => t.id !== tabId);

    this.stopFlashing(tabId);

    if (this.activeTab === tabId) {
      this.activeTab = "all";
    }

    this.requestUpdate();
  }

  private getFilteredEvents(): ChatEvent[] {
    if (this.activeTab === "all") {
      return this.chatEvents.filter((e) => !e.context || e.context === "all");
    } else {
      return this.chatEvents.filter((e) => e.context === this.activeTab);
    }
  }

  init() {
    // Chat is always visible, no toggle event needed

    // Add window resize listener to reset resize state
    window.addEventListener("resize", this.handleWindowResize);
  }

  private handleWindowResize = () => {
    // If currently resizing when window is resized, stop the resize operation
    if (this.isResizing) {
      this.stopResize();
    }
    
    // Keep chat within viewport bounds after window resize
    const maxX = window.innerWidth - this.chatWidth - 10;
    const maxY = window.innerHeight - this.chatHeight - 10;
    
    this.chatX = Math.max(10, Math.min(this.chatX, maxX));
    this.chatY = Math.max(10, Math.min(this.chatY, maxY));
  };

  tick() {
    this.active = true;
    const updates = this.game.updatesSinceLastTick();
    if (updates === null) return;

    const chatMessages = updates[GameUpdateType.DisplayChatEvent] as
      | DisplayChatMessageUpdate[]
      | undefined;

    if (chatMessages) {
      for (const msg of chatMessages) {
        if (msg.category === "all_chat" && msg.variables) {
          const sender = this.game.player(msg.variables.senderId);
          if (!sender) continue;

          const color = this.game.config().theme().territoryColor(sender);
          const flag = sender.flag();
          const avatar = flag
            ? sender.type() === PlayerType.FakeHuman
              ? `/Portraits/nations/${flag}.png`
              : `/Portraits/portrait_${flag}.png`
            : "";

          const translatedMessage = translateText(
            `chat.${msg.category}.${msg.key}`,
            msg.variables,
          );

          // Apply link filtering to the message
          const filteredMessage = this.filterAndProcessLinks(translatedMessage);

          this.addEvent({
            description: filteredMessage,
            createdAt: this.game.ticks(),
            highlight: true,
            unsafeDescription: true,
            avatar,
            senderName: msg.variables.senderName,
            senderColor: color.toHex(),
            variables: msg.variables,
            context: "all",
            senderId: msg.variables.senderId,
          });
        } else if (msg.category === "whisper" && msg.variables) {
          const isIncoming = msg.key === "message";

          if (isIncoming) {
            const sender = this.game.player(msg.variables.senderId);
            if (!sender) continue;

            // Don't process incoming whispers from ourselves (prevents duplicate tabs)
            const myPlayer = this.game.playerByClientID(this.clientID);
            if (sender === myPlayer) continue;

            const color = this.game.config().theme().territoryColor(sender);
            const flag = sender.flag();
            const avatar = flag
              ? sender.type() === PlayerType.FakeHuman
                ? `/Portraits/nations/${flag}.png`
                : `/Portraits/portrait_${flag}.png`
              : "";

            // Apply link filtering to whisper messages too
            const filteredMessage = this.filterAndProcessLinks(
              msg.variables.message,
            );

            this.addEvent({
              description: filteredMessage,
              createdAt: this.game.ticks(),
              highlight: true,
              unsafeDescription: true,
              avatar,
              senderName: msg.variables.senderName,
              senderColor: color.toHex(),
              variables: msg.variables,
              context: msg.variables.senderId,
              senderId: msg.variables.senderId,
            });
          } else {
            // Outgoing whisper confirmation
            if (!msg.variables) continue;

            const recipient = this.game.player(msg.variables.recipientId);
            if (!recipient) continue;

            const myPlayer = this.game.playerByClientID(this.clientID);
            const flag = myPlayer?.flag();
            const avatar = flag
              ? myPlayer?.type() === PlayerType.FakeHuman
                ? `/Portraits/nations/${flag}.png`
                : `/Portraits/portrait_${flag}.png`
              : "";

            // Apply link filtering to outgoing whisper confirmations
            const filteredMessage = this.filterAndProcessLinks(
              msg.variables.message,
            );

            this.addEvent({
              description: filteredMessage,
              createdAt: this.game.ticks(),
              highlight: false,
              unsafeDescription: true,
              avatar,
              senderName: "You",
              senderColor: "#a78bfa",
              variables: msg.variables,
              context: msg.variables.recipientId,
              senderId: myPlayer?.id(),
            });
          }
        }
      }
    }

    if (this.chatEvents.length > 100) {
      this.chatEvents = this.chatEvents.slice(-100);
    }

    this.requestUpdate();
  }

  private getChatContent(
    chat: ChatEvent,
  ): string | DirectiveResult<typeof UnsafeHTMLDirective> {
    return chat.unsafeDescription
      ? unsafeHTML(onlyImages(chat.description))
      : chat.description;
  }

  private handleChatInput(e: InputEvent) {
    this.chatInput = (e.target as HTMLInputElement).value;
  }

  private handleKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
  }

  private handleKeyUp(e: KeyboardEvent) {
    e.stopPropagation();
    // Handle Enter key for submitting
    if (e.key === "Enter" && this.chatInput.trim() !== "") {
      this.handleChatSubmit(e);
    }
  }

  public focusChatWithWhisper(playerName: string) {
    // Check if player is dead
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (myPlayer && !myPlayer.isAlive()) {
      this.addSystemMessage("You cannot send messages while dead.");
      return;
    }

    if (this._hidden) {
      this._hidden = false;
      this.newEvents = 0;
    }

    this.chatInput = `/w ${playerName} `;
    this.requestUpdate();

    setTimeout(() => {
      const input = this.querySelector(".chat-input") as HTMLInputElement;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 0);
  }

  public openWhisperTab(playerId: string, playerName: string) {
    // Check if player is dead
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (myPlayer && !myPlayer.isAlive()) {
      this.addSystemMessage("You cannot send messages while dead.");
      return;
    }

    // Show chat if hidden
    if (this._hidden) {
      this._hidden = false;
      this.newEvents = 0;
    }

    // Ensure tab exists
    this.ensureWhisperTab(playerId, playerName);

    // Switch to the tab
    this.switchTab(playerId);

    // Focus input after update
    setTimeout(() => {
      const input = this.querySelector(".chat-input") as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 0);

    this.requestUpdate();
  }

  private handleChatSubmit(e: KeyboardEvent) {
    if (e.key === "Enter" && this.chatInput.trim() !== "") {
      e.preventDefault();
      const myPlayer = this.game.playerByClientID(this.clientID);
      if (myPlayer) {
        // Check if player is dead
        if (!myPlayer.isAlive()) {
          this.addSystemMessage("You cannot send messages while dead.");
          this.chatInput = "";
          (e.target as HTMLInputElement).focus();
          return;
        }

        // Check flood protection
        if (!this.checkFloodProtection(myPlayer.id())) {
          this.chatInput = "";
          (e.target as HTMLInputElement).focus();
          return;
        }

        const message = this.chatInput.trim();

        // Check if we're in a whisper tab
        if (this.activeTab !== "all") {
          // Send whisper to the player of this tab
          const targetPlayer = this.game.player(this.activeTab);
          if (targetPlayer) {
            this.eventBus.emit(
              new SendWhisperEvent(myPlayer, targetPlayer, message),
            );
          }
        } else {
          const whisperMatch = message.match(
            /^\/w(?:hisper)?\s+(\S+)\s+(.+)$/i,
          );
          if (whisperMatch) {
            const targetName = whisperMatch[1];
            const whisperMessage = whisperMatch[2];

            const targetPlayer = this.game
              .playerViews()
              .find((p) => p.name().toLowerCase() === targetName.toLowerCase());

            if (targetPlayer && targetPlayer !== myPlayer) {
              this.eventBus.emit(
                new SendWhisperEvent(myPlayer, targetPlayer, whisperMessage),
              );
              // Ensure the whisper tab exists when initiating via command
              this.ensureWhisperTab(targetPlayer.id(), targetPlayer.name());
              // Switch to the whisper tab
              this.switchTab(targetPlayer.id());
            } else {
              this.addEvent({
                description:
                  targetPlayer === myPlayer
                    ? "You can't whisper to yourself!"
                    : `Player '${targetName}' not found.`,
                createdAt: this.game.ticks(),
                highlight: false,
                unsafeDescription: false,
                senderColor: "#ff0000",
                context: "all",
              });
            }
          } else {
            this.eventBus.emit(new SendAllChatEvent(myPlayer, message));
          }
        }

        this.chatInput = "";
        (e.target as HTMLInputElement).focus();
      }
    }
  }

  render() {
    if (!this.active) {
      return html``;
    }
    return html`
      <style>
        .chat-wrapper {
          position: fixed;
          top: ${this.chatY}px;
          left: ${this.chatX}px;
          z-index: 50;
          max-width: none !important;
          min-width: 0 !important;
          pointer-events: auto;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .chat-wrapper {
            /* Mobile positioning will still use dynamic values */
          }
        }

        .chat-container {
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow: hidden;
          min-width: 0 !important;
          box-sizing: border-box;
        }

        .chat-container.hidden {
          height: auto;
        }

        .chat-header {
          padding: 5px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
          min-width: 0;
          overflow: hidden;
          cursor: move;
          user-select: none;
        }

        .chat-header:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .resize-handle {
          position: absolute;
          top: 0;
          right: 0;
          width: 30px;
          height: 30px;
          cursor: ne-resize;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
          user-select: none;
          border-bottom-left-radius: 4px;
          z-index: 10;
          flex-shrink: 0;
        }

        .resize-handle:hover {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }

        .resize-handle::before {
          content: "⋰⋰";
          line-height: 0.8;
        }

        .chat-title {
          color: #ffd100;
          font-size: 12px;
          font-weight: bold;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 1;
        }

        .hide-button {
          color: white;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 2px;
          transition: background 0.2s;
          margin-right: 25px;
          min-width: 0;
          flex-shrink: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hide-button:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .show-button {
          color: white;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .new-events {
          background: #ff0000;
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: bold;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 5px 10px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
          min-width: 0;
        }

        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }

        .chat-message {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 2px;
          word-wrap: break-word;
        }

        .avatar {
          width: 24px;
          height: 24px;
          border-radius: 4px;
        }

        .sender-name {
          font-weight: bold;
        }

        .chat-input-container {
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          padding: 5px;
          min-width: 0;
          overflow: hidden;
        }

        .chat-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 5px 8px;
          border-radius: 2px;
          font-size: 13px;
          outline: none;
          min-width: 0;
          box-sizing: border-box;
        }

        .chat-input:focus {
          border-color: rgba(255, 255, 255, 0.5);
          background: rgba(0, 0, 0, 0.7);
        }

        .chat-input:disabled {
          background: rgba(0, 0, 0, 0.3);
          color: rgba(255, 255, 255, 0.4);
          border-color: rgba(255, 255, 255, 0.1);
          cursor: not-allowed;
        }

        .chat-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .chat-input:disabled::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .chat-tabs {
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 0, 0, 0.9);
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
        }

        .chat-tabs::-webkit-scrollbar {
          height: 4px;
        }

        .chat-tabs::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-tabs::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }

        .chat-tab {
          padding: 5px 12px;
          color: rgba(255, 255, 255, 0.7);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 5px;
          transition:
            background 0.2s,
            color 0.2s;
          position: relative;
          min-width: 0;
          flex-shrink: 0;
        }

        .chat-tab:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .chat-tab.active {
          color: white;
          background: rgba(255, 255, 255, 0.15);
          border-bottom: 2px solid #ffd100;
        }

        .chat-tab.flashing {
          animation: tabFlash 1.4s ease-in-out infinite;
        }

        @keyframes tabFlash {
          0%,
          100% {
            background: rgba(255, 255, 255, 0.1);
          }
          50% {
            background: rgba(255, 215, 0, 0.3);
          }
        }

        .chat-tab .close-tab {
          margin-left: 5px;
          padding: 0 4px;
          border-radius: 2px;
          font-size: 16px;
          line-height: 1;
          color: rgba(255, 255, 255, 0.5);
          transition:
            background 0.2s,
            color 0.2s;
        }

        .chat-tab .close-tab:hover {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .unread-indicator {
          width: 6px;
          height: 6px;
          background: #ffd100;
          border-radius: 50%;
          position: absolute;
          top: 4px;
          right: 4px;
        }

        .context-menu {
          position: fixed;
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          padding: 4px 0;
          z-index: 1000;
          min-width: 120px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }

        .context-menu-item {
          padding: 8px 12px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .context-menu-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .context-menu-item.danger:hover {
          background: rgba(220, 53, 69, 0.2);
          color: #ff6b7a;
        }

        .context-menu-item.primary:hover {
          background: rgba(66, 165, 245, 0.2);
          color: #64b5f6;
        }

        .clickable-username {
          cursor: pointer;
          user-select: none;
        }

        .clickable-username:hover {
          text-decoration: underline;
        }
      </style>

      <div class="chat-wrapper" style="width: ${this.chatWidth}px;">
        ${this._hidden
          ? html`
              <button class="show-button" @click=${this.toggleHidden}>
                <span>Chat</span>
                ${this.newEvents > 0
                  ? html`<span class="new-events">${this.newEvents}</span>`
                  : ""}
              </button>
            `
          : html`
              <div class="chat-container" style="height: ${this.chatHeight}px;">
                <div class="chat-header" @mousedown=${this.startDrag}>
                  <span class="chat-title">Chat</span>
                  <button class="hide-button" @click=${this.toggleHidden}>
                    Hide
                  </button>
                  <div
                    class="resize-handle"
                    @mousedown=${this.startResize}
                    title="Drag to resize"
                  ></div>
                </div>

                <div class="chat-tabs">
                  ${this.tabs.map(
                    (tab) => html`
                      <button
                        class="chat-tab ${this.activeTab === tab.id
                          ? "active"
                          : ""} ${tab.isFlashing ? "flashing" : ""}"
                        @click=${() => this.switchTab(tab.id)}
                      >
                        ${tab.name}
                        ${tab.hasUnread && this.activeTab !== tab.id
                          ? html`<span class="unread-indicator"></span>`
                          : ""}
                        ${tab.id !== "all"
                          ? html`
                              <span
                                class="close-tab"
                                @click=${(e: Event) => this.closeTab(tab.id, e)}
                                >×</span
                              >
                            `
                          : ""}
                      </button>
                    `,
                  )}
                </div>

                <div class="chat-messages">
                  ${this.getFilteredEvents().map(
                    (chat) => html`
                      <div class="chat-message">
                        ${chat.avatar
                          ? html`<img
                              src=${chat.avatar}
                              class="avatar"
                              alt="avatar"
                            />`
                          : ""}
                        ${chat.senderId &&
                        chat.senderName !== "System" &&
                        chat.senderName !== "You"
                          ? html`<span
                              class="sender-name clickable-username"
                              style="color: ${chat.senderColor}"
                              @contextmenu=${(e: MouseEvent) =>
                                this.showContextMenu(
                                  e,
                                  chat.senderId!,
                                  chat.senderName!,
                                )}
                              >${chat.senderName}:</span
                            >`
                          : html`<span
                              class="sender-name"
                              style="color: ${chat.senderColor}"
                              >${chat.senderName}:</span
                            >`}
                        <span>${this.getChatContent(chat)}</span>
                      </div>
                    `,
                  )}
                </div>

                <div class="chat-input-container">
                  <input
                    type="text"
                    class="chat-input"
                    .value=${this.chatInput}
                    .disabled=${this.game.myPlayer() &&
                    !this.game.myPlayer()!.isAlive()}
                    @input=${this.handleChatInput}
                    @keydown=${this.handleKeyDown}
                    @keyup=${this.handleKeyUp}
                    placeholder=${this.game.myPlayer() &&
                    !this.game.myPlayer()!.isAlive()
                      ? "You cannot chat while dead"
                      : this.activeTab === "all"
                        ? "Type to chat..."
                        : `Whisper to ${this.tabs.find((t) => t.id === this.activeTab)?.name}...`}
                  />
                </div>
              </div>
            `}

        <!-- Context Menu -->
        ${this.contextMenu.visible
          ? html`
              <div
                class="context-menu"
                style="left: ${this.contextMenu.x}px; top: ${this.contextMenu
                  .y}px;"
              >
                <div
                  class="context-menu-item primary"
                  @click=${() =>
                    this.whisperUser(
                      this.contextMenu.targetPlayerId!,
                      this.contextMenu.targetPlayerName!,
                    )}
                >
                  Whisper ${this.contextMenu.targetPlayerName}
                </div>
                ${this.blockedUsers.has(this.contextMenu.targetPlayerId!)
                  ? html`
                      <div
                        class="context-menu-item"
                        @click=${() =>
                          this.unblockUser(this.contextMenu.targetPlayerId!)}
                      >
                        Unblock User
                      </div>
                    `
                  : html`
                      <div
                        class="context-menu-item danger"
                        @click=${() =>
                          this.blockUser(this.contextMenu.targetPlayerId!)}
                      >
                        Block User
                      </div>
                    `}
              </div>
            `
          : ""}
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}
