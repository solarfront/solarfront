import mainMenuBG from "../../../../resources/maps/MainMenuBG.png";
import starbg from "../../../../resources/maps/Starbg.png";
import { Theme } from "../../../core/configuration/Config";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

export class TerrainLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private imageData: ImageData;
  private theme: Theme;
  private starBgImage: HTMLImageElement | null = null;
  private mainMenuBgImage: HTMLImageElement | null = null;
  private starBgLoaded: boolean = false;
  private mainMenuBgLoaded: boolean = false;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

  shouldTransform(): boolean {
    return true;
  }

  tick() {
    if (this.game.config().theme() !== this.theme) {
      this.redraw();
    }
  }

  init() {
    // Load the starry background image if not already loaded
    if (!this.starBgImage) {
      this.starBgImage = new window.Image();
      this.starBgImage.src = starbg;
      this.starBgImage.onload = () => {
        this.starBgLoaded = true;
        this.redraw();
      };
    }

    // Load the main menu background image if not already loaded
    if (!this.mainMenuBgImage) {
      this.mainMenuBgImage = new window.Image();
      this.mainMenuBgImage.src = mainMenuBG;
      this.mainMenuBgImage.onload = () => {
        this.mainMenuBgLoaded = true;
        this.redraw();
      };
    }

    console.log("redrew terrain layer");
    this.redraw();
  }

  redraw(): void {
    this.canvas = document.createElement("canvas");
    const context = this.canvas.getContext("2d");
    if (context === null) throw new Error("2d context not supported");
    this.context = context;

    this.imageData = this.context.getImageData(
      0,
      0,
      this.game.width(),
      this.game.height(),
    );
    this.initImageData();
    this.canvas.width = this.game.width();
    this.canvas.height = this.game.height();
    this.context.putImageData(this.imageData, 0, 0);
  }

  initImageData() {
    this.theme = this.game.config().theme();
    this.game.forEachTile((tile) => {
      const terrainColor = this.theme.terrainColor(this.game, tile);
      // TODO: isn'te tileref and index the same?
      const index = this.game.y(tile) * this.game.width() + this.game.x(tile);
      const offset = index * 4;
      this.imageData.data[offset] = terrainColor.rgba.r;
      this.imageData.data[offset + 1] = terrainColor.rgba.g;
      this.imageData.data[offset + 2] = terrainColor.rgba.b;
      this.imageData.data[offset + 3] = (terrainColor.rgba.a * 255) | 0;
    });
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Draw appropriate background based on whether we're in the main menu
    if (this.game.config().isMainMenu()) {
      if (this.mainMenuBgImage && this.mainMenuBgLoaded) {
        context.drawImage(
          this.mainMenuBgImage,
          -this.game.width() / 2,
          -this.game.height() / 2,
          this.game.width(),
          this.game.height(),
        );
      }
    } else {
      if (this.starBgImage && this.starBgLoaded) {
        context.drawImage(
          this.starBgImage,
          -this.game.width() / 2,
          -this.game.height() / 2,
          this.game.width(),
          this.game.height(),
        );
      }
    }

    if (this.transformHandler.scale < 1) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "low";
    } else {
      context.imageSmoothingEnabled = false;
    }

    // Draw terrain normally
    context.drawImage(
      this.canvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
  }
}
