import page from "page";
import favicon from "../../resources/images/Favicon.svg";
import { consolex } from "../core/Consolex";
import { GameRecord, GameStartInfo } from "../core/Schemas";
import { CursorManager } from "./CursorManager";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import { GameType } from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import { joinLobby } from "./ClientGameRunner";
import { SoundManager } from "./soundeffects/effects/SoundManager";
import "./DarkModeButton";
import { DarkModeButton } from "./DarkModeButton";
import "./FlagInput";
import { FlagInput } from "./FlagInput";
import { GameStartingModal } from "./GameStartingModal";
import { HostLobbyModal as HostPrivateLobbyModal } from "./HostLobbyModal";
import { JoinPrivateLobbyModal } from "./JoinPrivateLobbyModal";
import "./LangSelector";
import { LangSelector } from "./LangSelector";
import { LanguageModal } from "./LanguageModal";
import { NewsModal } from "./NewsModal";
import "./PublicLobby";
import { PublicLobby } from "./PublicLobby";
import "./SandboxModal";
import { SandboxModal } from "./SandboxModal";
import { SinglePlayerModal } from "./SinglePlayerModal";
//import { UserSettingModal } from "./UserSettingModal";
import "./UsernameInput";
import { UsernameInput } from "./UsernameInput";
import { generateCryptoRandomUUID } from "./Utils";
import "./components/NewsButton";
import { NewsButton } from "./components/NewsButton";
import "./components/baseComponents/Button";
import { OButton } from "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import { isLoggedIn } from "./jwt";
import "./styles.css";

export interface JoinLobbyEvent {
  clientID: string;
  // Multiplayer games only have gameID, gameConfig is not known until game starts.
  gameID: string;
  // GameConfig only exists when playing a singleplayer game.
  gameStartInfo?: GameStartInfo;
  // GameRecord exists when replaying an archived game.
  gameRecord?: GameRecord;
  persistentID?: string; // Added for sandbox mode to override default
}

class Client {
  private gameStop: (() => void) | null = null;

  private usernameInput: UsernameInput | null = null;
  private flagInput: FlagInput | null = null;
  private darkModeButton: DarkModeButton | null = null;

  private joinModal: JoinPrivateLobbyModal;
  private publicLobby: PublicLobby;

  private userSettings: UserSettings = new UserSettings();

  constructor() {}

  initialize(): void {
    // Initialize sound manager on first user interaction
    const initSound = () => {
      const soundManager = SoundManager.getInstance();
      soundManager.init().catch(err => {
        consolex.warn('Failed to initialize sound:', err);
      });
      
      // Initialize audio settings from localStorage
      const userSettings = new UserSettings();
      soundManager.setSoundEffectsEnabled(userSettings.soundEffectsEnabled());
      soundManager.setMusicEnabled(userSettings.musicEnabled());
      consolex.log('Audio settings initialized from localStorage');
    };
    document.addEventListener('click', initSound, { once: true });
    document.addEventListener('keydown', initSound, { once: true });

    const newsModal = document.querySelector("news-modal") as NewsModal;
    if (!newsModal) {
      consolex.warn("News modal element not found");
    } else {
      consolex.log("News modal element found");
    }
    newsModal instanceof NewsModal;
    const newsButton = document.querySelector("news-button") as NewsButton;
    if (!newsButton) {
      consolex.warn("News button element not found");
    } else {
      consolex.log("News button element found");
    }

    // Comment out to show news button.
    //newsButton.hidden = true;

    const langSelector = document.querySelector(
      "lang-selector",
    ) as LangSelector;
    const LanguageModal = document.querySelector(
      "lang-selector",
    ) as LanguageModal;
    if (!langSelector) {
      consolex.warn("Lang selector element not found");
    }
    if (!LanguageModal) {
      consolex.warn("Language modal element not found");
    }

    this.flagInput = document.querySelector("avatar-input") as FlagInput;
    if (!this.flagInput) {
      consolex.warn("Avatar input element not found");
    }

    this.darkModeButton = document.querySelector(
      "dark-mode-button",
    ) as DarkModeButton;
    if (!this.darkModeButton) {
      consolex.warn("Dark mode button element not found");
    }

    const joinDiscordButton = document.getElementById(
      "join-discord",
    ) as OButton;
    const logoutDiscordButton = document.getElementById(
      "logout-discord",
    ) as OButton;

    this.usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput;
    if (!this.usernameInput) {
      consolex.warn("Username input element not found");
    }

    this.publicLobby = document.querySelector("public-lobby") as PublicLobby;

    window.addEventListener("beforeunload", () => {
      consolex.log("Browser is closing");
      if (this.gameStop !== null) {
        this.gameStop();
      }
    });

    setFavicon();
    document.addEventListener("join-lobby", this.handleJoinLobby.bind(this));
    document.addEventListener("leave-lobby", this.handleLeaveLobby.bind(this));

    const spModal = document.querySelector(
      "single-player-modal",
    ) as SinglePlayerModal;
    spModal instanceof SinglePlayerModal;
    const singlePlayer = document.getElementById("single-player");
    if (singlePlayer === null) throw new Error("Missing single-player");
    singlePlayer.addEventListener("click", () => {
      if (this.usernameInput?.isValid()) {
        spModal.open();
      }
    });

    // Sandbox Mode handler
    const sandboxModal = document.querySelector(
      "sandbox-modal",
    ) as SandboxModal;
    sandboxModal instanceof SandboxModal;
    const sandboxButton = document.getElementById("sandbox-mode");
    if (sandboxButton) {
      sandboxButton.addEventListener("click", () => {
        sandboxModal.open();
      });
    }

    // const ctModal = document.querySelector("chat-modal") as ChatModal;
    // ctModal instanceof ChatModal;
    // document.getElementById("chat-button").addEventListener("click", () => {
    //   ctModal.open();
    // });

    // Help modal functionality removed - instructions button no longer exists

    // Join Discord button functionality
    if (joinDiscordButton) {
      joinDiscordButton.addEventListener("click", () => {
        window.open("https://discord.gg/PRMmPBg2Qv", "_blank");
      });
    }

    /*const settingsModal = document.querySelector(
      "user-setting",
    ) as UserSettingModal;
    settingsModal instanceof UserSettingModal;
    document
      .getElementById("settings-button")
      ?.addEventListener("click", () => {
        settingsModal.open();
      });*/

    const hostModal = document.querySelector(
      "host-lobby-modal",
    ) as HostPrivateLobbyModal;
    hostModal instanceof HostPrivateLobbyModal;
    const hostLobbyButton = document.getElementById("host-lobby-button");
    if (hostLobbyButton === null) throw new Error("Missing host-lobby-button");
    hostLobbyButton.addEventListener("click", () => {
      if (this.usernameInput?.isValid()) {
        hostModal.open();
        this.publicLobby.leaveLobby();
      }
    });

    this.joinModal = document.querySelector(
      "join-private-lobby-modal",
    ) as JoinPrivateLobbyModal;
    this.joinModal instanceof JoinPrivateLobbyModal;
    const joinPrivateLobbyButton = document.getElementById(
      "join-private-lobby-button",
    );
    if (joinPrivateLobbyButton === null)
      throw new Error("Missing join-private-lobby-button");
    joinPrivateLobbyButton.addEventListener("click", () => {
      if (this.usernameInput?.isValid()) {
        this.joinModal.open();
      }
    });

    if (this.userSettings.darkMode()) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    page("/join/:lobbyId", (ctx) => {
      if (ctx.init && sessionStorage.getItem("inLobby")) {
        // On page reload, go back home
        page.redirect("/");
        return;
      }
      const lobbyId = ctx.params.lobbyId;

      this.joinModal.open(lobbyId);

      consolex.log(`joining lobby ${lobbyId}`);
    });

    page();
    function updateSliderProgress(slider) {
      const percent =
        ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
      slider.style.setProperty("--progress", `${percent}%`);
    }

    document
      .querySelectorAll("#bots-count, #private-lobby-bots-count")
      .forEach((slider) => {
        updateSliderProgress(slider);
        slider.addEventListener("input", () => updateSliderProgress(slider));
      });
  }

  private async handleJoinLobby(event: CustomEvent) {
    const lobby = event.detail as JoinLobbyEvent;
    consolex.log(`joining lobby ${lobby.gameID}`);
    if (this.gameStop !== null) {
      consolex.log("joining lobby, stopping existing game");
      this.gameStop();
    }
    const config = await getServerConfigFromClient();

    this.gameStop = joinLobby(
      {
        gameID: lobby.gameID,
        serverConfig: config,
        flag:
          this.flagInput === null || this.flagInput.getCurrentFlag() === "xx"
            ? ""
            : this.flagInput.getCurrentFlag(),
        playerName: this.usernameInput?.getCurrentUsername() ?? "",
        token:
          lobby.persistentID ??
          localStorage.getItem("token") ??
          getPersistentIDFromCookie(),
        clientID: lobby.clientID,
        gameStartInfo: lobby.gameStartInfo ?? lobby.gameRecord?.gameStartInfo,
        gameRecord: lobby.gameRecord,
      },
      () => {
        console.log("Closing modals");
        document.getElementById("settings-button")?.classList.add("hidden");

        // Hide dev branch banner when entering game
        const devBanner = document.getElementById("dev-branch-banner");
        if (devBanner) {
          devBanner.style.display = "none";
        }

        // Hide sandbox button when entering game
        const sandboxButton = document.getElementById("sandbox-mode");
        if (sandboxButton) {
          sandboxButton.style.display = "none";
        }

        [
          "single-player-modal",
          "host-lobby-modal",
          "join-private-lobby-modal",
          "game-starting-modal",
          "top-bar",
          "help-modal",
          "user-setting",
          "sandbox-modal",
        ].forEach((tag) => {
          const modal = document.querySelector(tag) as HTMLElement & {
            close?: () => void;
            isModalOpen?: boolean;
          };
          if (modal?.close) {
            modal.close();
          } else if ("isModalOpen" in modal) {
            modal.isModalOpen = false;
          }
        });
        this.publicLobby.stop();

        // show when the game loads
        const startingModal = document.querySelector(
          "game-starting-modal",
        ) as GameStartingModal;
        startingModal instanceof GameStartingModal;
        startingModal.show();
      },
      () => {
        this.joinModal.close();
        this.publicLobby.stop();

        if (event.detail.gameConfig?.gameType !== GameType.Singleplayer) {
          window.history.pushState({}, "", `/join/${lobby.gameID}`);
          sessionStorage.setItem("inLobby", "true");
        }
      },
    );
  }

  private async handleLeaveLobby(/* event: CustomEvent */) {
    if (this.gameStop === null) {
      return;
    }
    consolex.log("leaving lobby, cancelling game");
    this.gameStop();
    this.gameStop = null;
    this.publicLobby.leaveLobby();

    // Show dev branch banner again when leaving game
    const devBanner = document.getElementById("dev-branch-banner");
    if (devBanner) {
      devBanner.style.display = "block";
    }

    // Show sandbox button again when leaving game
    const sandboxButton = document.getElementById("sandbox-mode");
    if (sandboxButton) {
      sandboxButton.style.display = "block";
    }
  }
}

// Initialize the client when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new Client().initialize();
  
  // Initialize custom cursor system
  const cursorManager = CursorManager.getInstance();
  cursorManager.initialize();
});

function setFavicon(): void {
  const link = document.createElement("link");
  link.type = "image/x-icon";
  link.rel = "shortcut icon";
  link.href = favicon;
  document.head.appendChild(link);
}

// WARNING: DO NOT EXPOSE THIS ID
export function getPersistentIDFromCookie(): string {
  const claims = isLoggedIn();
  if (claims !== false && claims.sub) {
    return claims.sub;
  }

  const COOKIE_NAME = "player_persistent_id";

  // Try to get existing cookie
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.split("=").map((c) => c.trim());
    if (cookieName === COOKIE_NAME) {
      return cookieValue;
    }
  }

  // If no cookie exists, create new ID and set cookie
  const newID = generateCryptoRandomUUID();
  document.cookie = [
    `${COOKIE_NAME}=${newID}`,
    `max-age=${5 * 365 * 24 * 60 * 60}`, // 5 years
    "path=/",
    "SameSite=Strict",
    "Secure",
  ].join(";");

  return newID;
}
