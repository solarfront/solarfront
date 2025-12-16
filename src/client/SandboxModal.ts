import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { generateID } from "../core/Util";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import { Difficulty, GameMapType, GameMode, GameType } from "../core/game/Game";
import { JoinLobbyEvent } from "./Main";
import { OModal } from "./components/baseComponents/Modal";

@customElement("sandbox-modal")
export class SandboxModal extends OModal {
  @state() private sandboxMode: "singleplayer" | "multiplayer" = "singleplayer";
  @state() private infiniteResources: boolean = true;
  @state() private instantBuild: boolean = true;
  @state() private peacefulBots: boolean = true;
  @state() private isCreating: boolean = false;
  @state() private lobbyCode: string = "";
  @state() private hasJoined: boolean = false;
  @state() private playerCount: number = 0;
  @state() private readyToStart: boolean = false;
  @state() private player1ClientID: string = "";
  @state() private joinedPlayers: Set<string> = new Set();

  private pollInterval: number | null = null;
  private readyTimeout: number | null = null;

  handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.close();
    }
  }

  close() {
    super.close();
    // Clean up when closing
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    this.lobbyCode = "";
    this.hasJoined = false;
    this.playerCount = 0;
    this.readyToStart = false;
    this.player1ClientID = "";
    this.joinedPlayers.clear();
  }

  render() {
    if (!this.isModalOpen) return html``;

    const modalStyles = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      
      .modal-content {
        background: #1a1a1a;
        border-radius: 0.75rem;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        position: relative;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      }
      
      .close-button {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #888;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.25rem;
        line-height: 1;
      }
      
      .close-button:hover {
        color: #fff;
      }
      
      .sandbox-options {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 1rem 0;
      }

      .checkbox-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #fff;
      }
      
      .checkbox-group input[type="checkbox"] {
        width: 1.2rem;
        height: 1.2rem;
        cursor: pointer;
      }
      
      .checkbox-group label {
        cursor: pointer;
        user-select: none;
      }

      .start-button {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        color: white;
        border: none;
        padding: 0.75rem 2rem;
        border-radius: 0.5rem;
        font-size: 1.1rem;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        margin-top: 1rem;
        width: 100%;
      }

      .start-button:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
      }
      
      .start-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .info-text {
        background: rgba(139, 92, 246, 0.1);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 0.5rem;
        padding: 0.75rem;
        margin: 1rem 0;
        font-size: 0.9rem;
        color: #bbb;
      }
      
      .info-text strong {
        color: #fff;
      }
      
      .lobby-code {
        background: #000;
        border: 2px solid #8b5cf6;
        border-radius: 0.5rem;
        padding: 1rem;
        margin: 1rem 0;
        text-align: center;
        font-family: monospace;
        font-size: 1.5rem;
        color: #8b5cf6;
        letter-spacing: 0.2em;
      }
      
      .copy-button {
        background: #8b5cf6;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-size: 0.9rem;
        cursor: pointer;
        margin-top: 0.5rem;
      }
      
      .copy-button:hover {
        background: #7c3aed;
      }
      
      .mode-selection {
        display: flex;
        gap: 0.5rem;
        margin: 1rem 0;
      }
      
      .mode-button {
        flex: 1;
        padding: 0.75rem;
        border: 2px solid #374151;
        background: #1f2937;
        color: #9ca3af;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
        font-weight: 500;
      }
      
      .mode-button.selected {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.1);
        color: #8b5cf6;
      }
      
      .mode-button:hover {
        border-color: #6b7280;
        color: #d1d5db;
      }
      
      .mode-button.selected:hover {
        border-color: #7c3aed;
        color: #a855f7;
      }
    `;

    return html`
      <style>
        ${modalStyles}
      </style>
      <div class="modal-overlay" @click="${this.handleOverlayClick}">
        <div class="modal-content">
          <button class="close-button" @click="${this.close}">&times;</button>

          <h2 style="color: #8b5cf6; text-align: center; margin-bottom: 1rem;">
            🔧 Sandbox Mode
          </h2>

          <!-- Mode Selection -->
          <div class="mode-selection">
            <div
              class="mode-button ${this.sandboxMode === "singleplayer"
                ? "selected"
                : ""}"
              @click="${() => this.handleModeSelection("singleplayer")}"
            >
              👤 Single Player
            </div>
            <div
              class="mode-button ${this.sandboxMode === "multiplayer"
                ? "selected"
                : ""}"
              @click="${() => this.handleModeSelection("multiplayer")}"
            >
              👥 Multi-Player
            </div>
          </div>

          ${this.sandboxMode === "singleplayer"
            ? this.renderSinglePlayerMode()
            : this.renderMultiPlayerMode()}
        </div>
      </div>
    `;
  }

  private handleModeSelection(mode: "singleplayer" | "multiplayer") {
    this.sandboxMode = mode;
    // Reset state when switching modes
    this.hasJoined = false;
    this.lobbyCode = "";
    this.playerCount = 0;
    this.readyToStart = false;
    this.isCreating = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
  }

  private renderSinglePlayerMode() {
    return html`
      <div class="info-text">
        <strong>Single Player Sandbox Mode</strong><br />
        Test features and mechanics in a controlled environment with infinite
        resources and instant building.
      </div>

      <div class="sandbox-options">
        <div class="checkbox-group">
          <input
            type="checkbox"
            id="infinite-resources-sp"
            ?checked="${this.infiniteResources}"
            @change="${(e: Event) => {
              this.infiniteResources = (e.target as HTMLInputElement).checked;
            }}"
          />
          <label for="infinite-resources-sp">Infinite Resources</label>
        </div>

        <div class="checkbox-group">
          <input
            type="checkbox"
            id="instant-build-sp"
            ?checked="${this.instantBuild}"
            @change="${(e: Event) => {
              this.instantBuild = (e.target as HTMLInputElement).checked;
            }}"
          />
          <label for="instant-build-sp">Instant Build</label>
        </div>

        <div class="checkbox-group">
          <input
            type="checkbox"
            id="peaceful-bots-sp"
            ?checked="${this.peacefulBots}"
            @change="${(e: Event) => {
              this.peacefulBots = (e.target as HTMLInputElement).checked;
            }}"
          />
          <label for="peaceful-bots-sp">Peaceful Bots</label>
        </div>
      </div>

      <button class="start-button" @click="${this.startSinglePlayerGame}">
        Start Single Player Sandbox
      </button>
    `;
  }

  private renderMultiPlayerMode() {
    return html`
      ${this.hasJoined
        ? html`
            <div class="info-text">
              <strong>Sandbox Lobby: ${this.lobbyCode}</strong><br />
              Players in lobby: ${this.playerCount}/2
            </div>

            ${this.playerCount < 2
              ? html`
                  <div style="text-align: center; margin: 2rem 0;">
                    <p style="color: #bbb; margin-bottom: 1rem;">
                      ${this.playerCount === 0
                        ? "Waiting for Player 1 to join..."
                        : "Player 1 has joined! Waiting for Player 2..."}
                    </p>
                    ${this.playerCount === 1
                      ? html`
                          <p style="color: #bbb; margin-bottom: 1rem;">
                            To control Player 2: Open a new tab/window and join
                            with the code below
                          </p>
                          <div class="lobby-code">${this.lobbyCode}</div>
                          <button
                            class="copy-button"
                            @click="${this.copyLobbyCode}"
                          >
                            Copy Code
                          </button>
                        `
                      : ""}
                    ${this.playerCount === 1
                      ? html`
                          <div
                            style="margin-top: 1rem; padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 0.5rem;"
                          >
                            <p
                              style="color: #60a5fa; font-size: 0.85rem; margin: 0;"
                            >
                              <strong>You are Player 1!</strong><br />
                              After the game starts, click on any empty land
                              tile (green areas) to place your starting base.<br />
                              <em
                                >If you can't spawn, check the browser console
                                for errors.</em
                              >
                            </p>
                          </div>
                        `
                      : ""}
                  </div>
                `
              : html`
                  <div style="text-align: center; margin: 2rem 0;">
                    ${this.readyToStart
                      ? html`
                          <p style="color: #4ade80; margin-bottom: 1rem;">
                            ✅ Both players have joined!
                          </p>
                          <button
                            class="start-button"
                            @click="${this.startGame}"
                          >
                            Start Sandbox Game
                          </button>
                          <div
                            style="margin-top: 1rem; padding: 1rem; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 0.5rem;"
                          >
                            <p
                              style="color: #ffc107; font-size: 0.9rem; margin: 0;"
                            >
                              <strong>Important:</strong> After the game starts,
                              each player must click on an empty land tile to
                              spawn their base!
                            </p>
                          </div>
                        `
                      : html`
                          <p style="color: #fbbf24; margin-bottom: 1rem;">
                            ⏳ Getting ready...<br />
                            <small style="color: #bbb;"
                              >Making sure both players are connected</small
                            >
                          </p>
                        `}
                  </div>
                `}
          `
        : this.lobbyCode
          ? html`
              <div class="info-text">
                <strong>Sandbox lobby created!</strong><br />
                Join as Player 1 first, then open another tab for Player 2.
              </div>

              <div class="lobby-code">${this.lobbyCode}</div>

              <button class="copy-button" @click="${this.copyLobbyCode}">
                Copy Code
              </button>

              <button class="start-button" @click="${this.joinAsPlayer1}">
                Join as Player 1
              </button>

              <div
                style="margin-top: 1rem; padding: 0.75rem; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 0.5rem;"
              >
                <p style="color: #ffc107; font-size: 0.85rem; margin: 0;">
                  <strong>Important:</strong> Join as Player 1 first and wait
                  for confirmation before opening Player 2's tab!
                </p>
              </div>
            `
          : html`
              <div class="info-text">
                <strong>Two-Player Testing Environment</strong><br />
                Create a sandbox lobby and control both players from different
                browser tabs.
              </div>

              <div class="sandbox-options">
                <div class="checkbox-group">
                  <input
                    type="checkbox"
                    id="infinite-resources"
                    ?checked="${this.infiniteResources}"
                    @change="${(e: Event) => {
                      this.infiniteResources = (
                        e.target as HTMLInputElement
                      ).checked;
                    }}"
                  />
                  <label for="infinite-resources">Infinite Resources</label>
                </div>

                <div class="checkbox-group">
                  <input
                    type="checkbox"
                    id="instant-build"
                    ?checked="${this.instantBuild}"
                    @change="${(e: Event) => {
                      this.instantBuild = (
                        e.target as HTMLInputElement
                      ).checked;
                    }}"
                  />
                  <label for="instant-build">Instant Build</label>
                </div>
              </div>

              <div style="text-align: center; margin: 1rem 0;">
                <small style="color: #6b7280;">
                  💡 How to use:<br />
                  1. Click "Create Sandbox Lobby"<br />
                  2. Join as Player 1 in this tab<br />
                  3. Open a new tab and join as Player 2 with the same code<br />
                  4. Test battles by controlling both sides!
                </small>
              </div>

              <button
                class="start-button"
                @click="${this.createSandbox}"
                ?disabled="${this.isCreating}"
              >
                ${this.isCreating ? "Creating..." : "Create Sandbox Lobby"}
              </button>
            `}
    `;
  }

  private startSinglePlayerGame() {
    const clientID = generateID();
    const gameID = generateID();

    // Get username and flag inputs
    const usernameInput = document.querySelector("username-input") as any;
    const flagInput = document.querySelector("avatar-input") as any;

    // Dispatch single player game start event
    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          clientID: clientID,
          gameID: gameID,
          gameStartInfo: {
            gameID: gameID,
            players: [
              {
                playerID: generateID(),
                clientID,
                username: usernameInput?.getCurrentUsername() || "Player",
                flag:
                  flagInput?.getCurrentFlag() === "xx"
                    ? ""
                    : flagInput?.getCurrentFlag() || "",
              },
            ],
            config: {
              gameMap: GameMapType.Testmap,
              gameType: GameType.Singleplayer,
              gameMode: GameMode.FFA,
              playerTeams: undefined,
              difficulty: Difficulty.Easy,
              disableNPCs: !this.peacefulBots,
              disableNukes: false,
              bots: this.peacefulBots ? 0 : 20,
              infiniteGold: this.infiniteResources,
              infiniteTroops: this.infiniteResources,
              instantBuild: this.instantBuild,
              disabledUnits: [],
              spawnPhaseTurns: 50, // 50 turns = ~5 seconds for spawn phase (100ms per turn)
            },
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
    this.close();
  }

  private async createSandbox() {
    this.isCreating = true;
    const gameID = generateID();
    this.lobbyCode = gameID;

    try {
      const config = await getServerConfigFromClient();
      const response = await fetch(
        `${process.env.API_URL}/${config.workerPath(gameID)}/api/create_game/${gameID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gameConfig: {
              gameType: GameType.Private,
              gameMode: GameMode.FFA,
              gameMap: GameMapType.Testmap,
              maxPlayers: 2,
              bots: 0,
              difficulty: Difficulty.Easy,
              infiniteGold: this.infiniteResources,
              infiniteTroops: this.infiniteResources,
              instantBuild: this.instantBuild,
              disableNPCs: true,
              disabledUnits: [],
              playerTeams: undefined,
              isSandbox: true,
              spawnPhaseTurns: 50, // 50 turns = ~5 seconds for spawn phase (100ms per turn)
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to create sandbox lobby");
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      this.isCreating = false;
      this.requestUpdate();
    } catch (error) {
      console.error("Error creating sandbox lobby:", error);
      this.isCreating = false;
    }
  }

  private copyLobbyCode() {
    navigator.clipboard.writeText(this.lobbyCode);
    // Could add a "Copied!" notification here
  }

  private async joinAsPlayer1() {
    const clientID = generateID();
    const uniquePersistentID = `sandboxP1_${generateID()}`;
    this.player1ClientID = clientID;

    console.log(
      `[Sandbox] Player 1 attempting to join with clientID: ${clientID}, persistentID: ${uniquePersistentID}`,
    );

    this.hasJoined = false;
    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: this.lobbyCode,
          clientID,
          persistentID: uniquePersistentID,
        } as JoinLobbyEvent,
        bubbles: true,
        composed: true,
      }),
    );

    // Increased delay to 2.5 seconds to give the server more time
    setTimeout(async () => {
      try {
        const config = await getServerConfigFromClient();
        const response = await fetch(
          `${process.env.API_URL}/${config.workerPath(this.lobbyCode)}/api/game/${this.lobbyCode}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          const p1 = data.clients?.find((c) => c.clientID === clientID);

          if (p1) {
            console.log(
              `[Sandbox] Player 1 successfully registered on server.`,
            );
            this.joinedPlayers.add(clientID);
            this.hasJoined = true;
          } else {
            console.error(
              `[Sandbox] Player 1 NOT found in game clients after join.`,
            );
            this.hasJoined = false;
          }
        } else {
          console.error(
            `[Sandbox] Failed to verify join. Status: ${response.status}`,
          );
          this.hasJoined = false;
        }
      } catch (error) {
        console.error("[Sandbox] Exception verifying join:", error);
        this.hasJoined = false;
      }

      if (this.hasJoined) {
        this.pollPlayers();
        this.pollInterval = window.setInterval(() => this.pollPlayers(), 1000);
      }
    }, 2500);
  }

  private async pollPlayers() {
    try {
      const config = await getServerConfigFromClient();
      const response = await fetch(
        `${process.env.API_URL}/${config.workerPath(this.lobbyCode)}/api/game/${this.lobbyCode}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const previousCount = this.playerCount;
        this.playerCount = data.clients?.length ?? 0;

        console.log(
          `Polling - players in game: ${this.playerCount}`,
          data.clients,
        );

        // Track all joined players
        if (data.clients) {
          data.clients.forEach((client: any) => {
            this.joinedPlayers.add(client.clientID);
          });
        }

        // When the second player joins, start the ready timer
        if (previousCount < 2 && this.playerCount >= 2 && !this.readyTimeout) {
          console.log("Both players detected, starting ready countdown...");
          this.readyTimeout = window.setTimeout(() => {
            this.readyToStart = true;
            this.requestUpdate();
          }, 500); // 0.5 second delay (reduced from 0.75 to compensate for join delay)
        }
      }
    } catch (error) {
      console.error("Error polling players:", error);
    }
  }

  private async startGame() {
    try {
      // First verify both players are actually connected
      const config = await getServerConfigFromClient();
      let retries = 0;
      const maxRetries = 10;

      while (retries < maxRetries) {
        const verifyResponse = await fetch(
          `${process.env.API_URL}/${config.workerPath(this.lobbyCode)}/api/game/${this.lobbyCode}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (verifyResponse.ok) {
          const data = await verifyResponse.json();
          console.log(
            `Game status before starting - clients: ${data.clients?.length}`,
            data.clients,
          );

          if (data.clients?.length >= 2) {
            // Both players are connected, wait a bit more to ensure they're fully ready
            console.log(
              "Both players connected, waiting for synchronization...",
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
            break;
          }
        }

        retries++;
        if (retries >= maxRetries) {
          console.error("Failed to verify both players are connected");
          return;
        }

        console.log(
          `Waiting for all players to connect... (attempt ${retries}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log("Starting game...");
      const response = await fetch(
        `${process.env.API_URL}/${config.workerPath(this.lobbyCode)}/api/start_game/${this.lobbyCode}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start game");
      }

      console.log("Game started successfully!");
      // Close modal after starting game
      this.close();
    } catch (error) {
      console.error("Error starting game:", error);
    }
  }
}
