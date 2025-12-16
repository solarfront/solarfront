import { ClientID } from "../../../core/Schemas";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { Layer } from "./Layer";

export class SpawnGuidancePopup implements Layer {
  private isVisible: boolean = false;
  private hasShownMessage: boolean = false;
  private animationPhase: number = 0;
  private messageOpacity: number = 0;
  private popupY: number = -200; // Start off-screen
  private targetY: number = 50;   // Target position
  private portraitImage: HTMLImageElement | null = null;

  constructor(private game: GameView, private clientID: ClientID) {}

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

  private renderMiniPlayerElement(context: CanvasRenderingContext2D, x: number, y: number, scale: number = 0.8): void {
    const player = this.getMyPlayer();
    if (!player) return;

    const theme = this.game.config().theme();
    const radius = 12 * scale;
    
    context.save();
    
    // Draw player territory color circle (like the actual spawn node)
    context.fillStyle = theme.territoryColor(player).toHex();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    
    // Draw yellow stroke around it
    context.strokeStyle = "yellow";
    context.lineWidth = 10 * scale;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    
    context.restore();
  }

  tick() {
    const inSpawnPhase = this.game.inSpawnPhase();
    
    // Show popup when entering spawn phase
    if (inSpawnPhase && !this.hasShownMessage) {
      this.isVisible = true;
      this.hasShownMessage = true;
      this.popupY = this.targetY; // Instantly position at target
      this.messageOpacity = 1; // Instantly show at full opacity
      
      // Load the portrait using the same method as NameLayer
      this.loadPlayerPortrait();
    }
    
    // Hide popup when leaving spawn phase
    if (!inSpawnPhase && this.hasShownMessage) {
      this.isVisible = false;
      this.messageOpacity = 0; // Instantly hide
      this.popupY = -200; // Reset position
      // Reset for next game
      this.hasShownMessage = false;
    }

    // Text animation (keep the subtle pulsing for visual interest)
    this.animationPhase += 0.02;
  }

  shouldTransform(): boolean {
    return false; // UI overlay, no world transform
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (this.messageOpacity <= 0) return;

    const canvasWidth = context.canvas.width;
    
    // Popup dimensions
    const popupWidth = 400;
    const popupHeight = 100;
    const x = (canvasWidth - popupWidth) / 2;
    const y = this.popupY;

    context.save();
    context.globalAlpha = this.messageOpacity;

    // Draw popup background (StarFox style)
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

    // Avatar placeholder (left side)
    const avatarSize = 70;
    const avatarX = x + 15;
    const avatarY = y + 15;

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
    const textY = y + 30;
    const textWidth = popupWidth - (avatarSize + 50);

    // Message text with subtle animation
    const baseOpacity = 0.9 + 0.1 * Math.sin(this.animationPhase * 2);
    context.fillStyle = `rgba(255, 255, 255, ${baseOpacity})`;
    context.font = "bold 18px Arial, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";

    // First message: "This is you!" with player icon aligned inline
    const firstMessage = "This is you!";
    context.fillText(firstMessage, textX, textY);
    
    // Calculate position for player icon with generous spacing
    const messageWidth = context.measureText(firstMessage).width;
    const playerIconX = textX + messageWidth + 20; // Increased spacing to 20 pixels
    const playerIconY = textY + 10; // Align with text center
    
    // Render mini player element inline with text
    this.renderMiniPlayerElement(context, playerIconX, playerIconY);

    // Final message below the "This is you!" line
    context.font = "bold 16px Arial, sans-serif";
    context.fillStyle = `rgba(255, 255, 255, ${baseOpacity})`;
    const finalMessage = "Choose your spawn location!";
    context.fillText(finalMessage, textX, textY + 35);

    context.restore();
  }

}