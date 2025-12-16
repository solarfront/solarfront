import { ClientID } from "../../../core/Schemas";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { PlayerType } from "../../../core/game/Game";
import { Layer } from "./Layer";

interface TutorialMessage {
  id: string;
  title: string;
  message: string;
  triggerTime: number; // Seconds after spawn
  triggerCondition?: (game: GameView, player: PlayerView) => boolean;
}

export class TutorialPopup implements Layer {
  private currentTutorial: TutorialMessage | null = null;
  private isVisible: boolean = false;
  private messageOpacity: number = 0;
  private popupY: number = -200; // Start off-screen
  private targetY: number = 50;   // Target position
  private portraitImage: HTMLImageElement | null = null;
  private gameStartTick: number = -1;
  private dismissedTutorials: Set<string> = new Set();
  private tutorialsDisabled: boolean = false;
  private fadeOutTimer: number = 0;
  private tutorialShowTime: number = 0; // Track how long tutorial has been shown
  private spawnPhaseEnded: boolean = false;
  private spawnPhaseEndTick: number = -1;

  // Tutorial definitions - DISABLED
  // All tutorials are commented out to disable tutorial messages
  private tutorials: TutorialMessage[] = [
    // {
    //   id: "expand",
    //   title: "Expand Your Empire",
    //   message: "Click the wilderness tiles close to your territory to expand! Keep clicking to grow your borders outward.",
    //   triggerTime: 3, // 3 seconds
    // },
    // {
    //   id: "conquer_bots",
    //   title: "Conquer the Bots",
    //   message: "Your empire is growing! Conquer nearby bots to get 125k for your first colony.",
    //   triggerTime: 15, // 15 seconds
    // },
    // {
    //   id: "diplomacy",
    //   title: "Diplomacy Time",
    //   message: "Other players are getting close! Right click player names to request alliances. Be careful of who you trust.",
    //   triggerTime: 25, // 25 seconds
    // },
    // {
    //   id: "build_colony",
    //   title: "Build Your Colony",
    //   message: "Time to build! Drag from the hotkey bar below or press \"1\" on your territory to build a colony.",
    //   triggerTime: 60, // 60 seconds
    //   triggerCondition: (game, player) => player.gold() >= 125000,
    // },
    // {
    //   id: "advanced_warfare",
    //   title: "Advanced Warfare",
    //   message: "Build Ports near outer space to prepare your fleet. When you're strong enough, build a Nuclear Silo for devastating strikes.",
    //   triggerTime: 90, // 90 seconds
    // },
  ];

  constructor(private game: GameView, private clientID: ClientID) {
    // TEST MODE: Clear dismissed tutorials for testing
    localStorage.removeItem("dismissedTutorials");
    this.dismissedTutorials = new Set();
    
    // Tutorials are always enabled now
    this.tutorialsDisabled = false;
  }

  init() {}

  private getMyPlayer(): PlayerView | null {
    return this.game.playerViews().find((p) => p.clientID() === this.clientID) ?? null;
  }

  private loadPlayerPortrait(): void {
    const player = this.getMyPlayer();
    if (player && player.flag()) {
      this.portraitImage = new Image();
      this.portraitImage.src = `/Portraits/portrait_${player.flag()}.png`;
    }
  }

  private loadDismissedTutorials(): void {
    const stored = localStorage.getItem("dismissedTutorials");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.dismissedTutorials = new Set(parsed);
      } catch (e) {
        this.dismissedTutorials = new Set();
      }
    }
    
    this.tutorialsDisabled = localStorage.getItem("tutorialsDisabled") === "true";
  }

  private saveDismissedTutorials(): void {
    localStorage.setItem("dismissedTutorials", JSON.stringify(Array.from(this.dismissedTutorials)));
  }

  private dismissTutorial(tutorialId: string, permanent: boolean = false, instant: boolean = false): void {
    this.dismissedTutorials.add(tutorialId);
    this.saveDismissedTutorials();
    
    if (permanent) {
      this.tutorialsDisabled = true;
      localStorage.setItem("tutorialsDisabled", "true");
    }
    
    if (instant) {
      // Instant dismiss - no fade
      this.isVisible = false;
      this.currentTutorial = null;
      this.popupY = -200;
      this.tutorialShowTime = 0;
      this.messageOpacity = 0;
      this.fadeOutTimer = 0;
    } else {
      // Fade out for auto-dismiss
      this.fadeOutTimer = 30;
    }
  }

  tick() {
    const player = this.getMyPlayer();
    if (!player || !player.hasSpawned() || this.tutorialsDisabled) {
      return;
    }

    // Initialize game start tick
    if (this.gameStartTick === -1 && player.hasSpawned()) {
      this.gameStartTick = this.game.ticks();
      this.loadPlayerPortrait();
    }

    // Track when spawn phase ends
    if (!this.spawnPhaseEnded && !this.game.inSpawnPhase()) {
      this.spawnPhaseEnded = true;
      this.spawnPhaseEndTick = this.game.ticks();
      console.log("TutorialPopup: Spawn phase ended at tick:", this.spawnPhaseEndTick);
    }

    // Don't show tutorials until spawn phase has ended
    if (!this.spawnPhaseEnded) {
      return;
    }

    const gameTimeSeconds = (this.game.ticks() - this.spawnPhaseEndTick) / 10; // Time since spawn phase ended
    
    // Debug log every second with actual tick info
    if (Math.floor(gameTimeSeconds) !== Math.floor((gameTimeSeconds - 0.1))) {
      const currentTicks = this.game.ticks();
      const elapsedTicks = currentTicks - this.spawnPhaseEndTick;
      console.log("TutorialPopup: Time since spawn phase ended:", Math.floor(gameTimeSeconds), "seconds, ticks:", currentTicks, "elapsed:", elapsedTicks);
    }

    // Handle fade out
    if (this.fadeOutTimer > 0) {
      this.fadeOutTimer--;
      this.messageOpacity = Math.max(0, this.fadeOutTimer / 30);
      if (this.fadeOutTimer === 0) {
        this.isVisible = false;
        this.currentTutorial = null;
        this.popupY = -200;
        this.tutorialShowTime = 0;
      }
      return;
    }

    // Auto-dismiss after 7 seconds
    if (this.currentTutorial && this.tutorialShowTime > 0) {
      this.tutorialShowTime++;
      if (this.tutorialShowTime >= 70) { // 7 seconds at 10 ticks/sec
        this.dismissTutorial(this.currentTutorial.id, false, false); // Use fade out for auto-dismiss
        return;
      }
    }

    // Don't show new tutorial if one is already visible
    if (this.currentTutorial) {
      return;
    }

    // Stop showing tutorials after 140 seconds
    if (gameTimeSeconds >= 140) {
      return;
    }

    // Tutorials are always enabled now - no checking needed

    // Show tutorials at specific times with conditions
    for (const tutorial of this.tutorials) {
      // Skip if already dismissed
      if (this.dismissedTutorials.has(tutorial.id)) {
        continue;
      }
      
      // Check time trigger (use exact match to avoid repeated showing)
      if (Math.floor(gameTimeSeconds) === tutorial.triggerTime && !this.currentTutorial) {
        // Check condition if exists
        if (tutorial.triggerCondition && !tutorial.triggerCondition(this.game, player)) {
          continue;
        }
        
        console.log("TutorialPopup: Showing tutorial:", tutorial.id, "at", gameTimeSeconds, "seconds");
        this.currentTutorial = tutorial;
        this.isVisible = true;
        this.popupY = this.targetY;
        this.messageOpacity = 1;
        this.tutorialShowTime = 1; // Start tracking show time
        break;
      }
    }
  }

  shouldTransform(): boolean {
    return false; // UI overlay, no world transform
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (!this.isVisible || this.messageOpacity <= 0 || !this.currentTutorial) return;
    
    // Handle mouse clicks on the popup to dismiss
    const canvas = context.canvas;
    if (!canvas.dataset.tutorialClickHandler) {
      canvas.dataset.tutorialClickHandler = 'true';
      canvas.addEventListener('click', (e) => {
        if (this.isVisible && this.currentTutorial) {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          const canvasWidth = canvas.width;
          const popupWidth = 500;
          const popupHeight = 120;
          const popupX = (canvasWidth - popupWidth) / 2;
          const popupY = this.popupY;
          
          // Check if click is within popup bounds
          if (x >= popupX && x <= popupX + popupWidth &&
              y >= popupY && y <= popupY + popupHeight) {
            this.dismissTutorial(this.currentTutorial.id, false, true); // instant dismiss on click
          }
        }
      });
    }

    const canvasWidth = context.canvas.width;
    
    // Popup dimensions
    const popupWidth = 500;
    const popupHeight = 120;
    const x = (canvasWidth - popupWidth) / 2;
    const y = this.popupY;

    context.save();
    context.globalAlpha = this.messageOpacity;

    // Draw popup background (same style as SpawnGuidancePopup)
    const gradient = context.createLinearGradient(x, y, x, y + popupHeight);
    gradient.addColorStop(0, "rgba(20, 50, 100, 0.95)");
    gradient.addColorStop(0.5, "rgba(30, 70, 140, 0.95)");
    gradient.addColorStop(1, "rgba(15, 40, 80, 0.95)");
    
    context.fillStyle = gradient;
    context.fillRect(x, y, popupWidth, popupHeight);

    // Border styling
    context.strokeStyle = "rgba(100, 150, 255, 0.8)";
    context.lineWidth = 2;
    context.strokeRect(x, y, popupWidth, popupHeight);

    // Inner border glow
    context.strokeStyle = "rgba(150, 200, 255, 0.4)";
    context.lineWidth = 1;
    context.strokeRect(x + 2, y + 2, popupWidth - 4, popupHeight - 4);

    // Avatar (left side)
    const avatarSize = 70;
    const avatarX = x + 15;
    const avatarY = y + 25;

    // User's selected portrait
    if (this.portraitImage && this.portraitImage.complete && this.portraitImage.naturalWidth > 0) {
      context.drawImage(this.portraitImage, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      // Placeholder background while image loads
      context.fillStyle = "rgba(50, 100, 180, 0.7)";
      context.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      
      // Simple avatar placeholder
      context.fillStyle = "rgba(255, 255, 255, 0.8)";
      context.beginPath();
      context.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/3, 0, Math.PI * 2);
      context.fill();
    }
    
    // Avatar border
    context.strokeStyle = "rgba(120, 170, 255, 0.8)";
    context.lineWidth = 2;
    context.strokeRect(avatarX, avatarY, avatarSize, avatarSize);

    // Message text area
    const textX = avatarX + avatarSize + 20;
    const textY = y + 25;

    // Title
    context.fillStyle = "rgba(255, 255, 200, 1)";
    context.font = "bold 18px Arial, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(this.currentTutorial.title, textX, textY);

    // Message
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.font = "14px Arial, sans-serif";
    
    // Word wrap the message
    const maxWidth = popupWidth - (textX - x) - 20;
    const words = this.currentTutorial.message.split(' ');
    let line = '';
    let lineY = textY + 25;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        context.fillText(line, textX, lineY);
        line = word + ' ';
        lineY += 18;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, textX, lineY);

    // Dismiss button
    const buttonWidth = 60;
    const buttonHeight = 25;
    const buttonX = x + popupWidth - buttonWidth - 10;
    const buttonY = y + popupHeight - buttonHeight - 10;

    // Button background
    context.fillStyle = "rgba(50, 100, 150, 0.8)";
    context.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button border
    context.strokeStyle = "rgba(150, 200, 255, 0.8)";
    context.lineWidth = 1;
    context.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
    
    // Button text
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.font = "12px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Got it!", buttonX + buttonWidth/2, buttonY + buttonHeight/2);

    context.restore();
  }

}