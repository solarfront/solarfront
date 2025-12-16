import { colord, Colord } from "colord";
import { Theme } from "../../../core/configuration/Config";
import { EventBus } from "../../../core/EventBus";
import { Layer } from "./Layer";
import { SoundManager } from "../../soundeffects/effects/SoundManager";
import { TransformHandler } from "../TransformHandler";

import cityIcon from "../../../../resources/images/buildings/cityAlt1.png";
import OrbitalCannonIcon from "../../../../resources/images/buildings/Extra/fort0.png";
import shieldIcon from "../../../../resources/images/buildings/fortAlt2.png";
import anchorIcon from "../../../../resources/images/buildings/port1.png";
import MissileSiloReloadingIcon from "../../../../resources/images/buildings/silo1-reloading.png";
import missileSiloIcon from "../../../../resources/images/buildings/silo1.png";
import SAMMissileReloadingIcon from "../../../../resources/images/buildings/silo4-reloading.png";
import SAMMissileIcon from "../../../../resources/images/buildings/silo4.png";
import { Cell, UnitType } from "../../../core/game/Game";
import {
  euclDistFN,
  hexDistFN,
  manhattanDistFN,
  rectDistFN,
} from "../../../core/game/GameMap";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";

const underConstructionColor = colord({ r: 150, g: 150, b: 150 });
const reloadingColor = colord({ r: 255, g: 0, b: 0 });

type DistanceFunction = typeof euclDistFN;

enum UnitBorderType {
  Round,
  Diamond,
  Square,
  Hexagon,
}

interface UnitRenderConfig {
  icon: string;
  borderRadius: number;
  territoryRadius: number;
  borderType: UnitBorderType;
}

export class StructureLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private unitIcons: Map<string, ImageData> = new Map();
  private theme: Theme;
  private soundManager = SoundManager.getInstance();
  
  // Track building completions
  private trackedUnits = new Set<number>();
  private constructionUnits = new Set<number>();

  // Configuration for supported unit types only
  private readonly unitConfigs: Partial<Record<UnitType, UnitRenderConfig>> = {
    [UnitType.Port]: {
      icon: anchorIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Round,
    },
    [UnitType.City]: {
      icon: cityIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Round,
    },
    [UnitType.MissileSilo]: {
      icon: missileSiloIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Square,
    },
    [UnitType.DefensePost]: {
      icon: shieldIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Hexagon,
    },
    [UnitType.SAMLauncher]: {
      icon: SAMMissileIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Square,
    },
    [UnitType.OrbitalCannon]: {
      icon: OrbitalCannonIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Square,
    },
  };

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
  ) {
    this.theme = game.config().theme();
    
    // Initialize sound manager with transform handler for spatial audio
    this.soundManager.setTransformHandler(transformHandler);
    
    this.loadIconData();
    this.loadIcon("reloadingSam", {
      icon: SAMMissileReloadingIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Square,
    });
    this.loadIcon("reloadingSilo", {
      icon: MissileSiloReloadingIcon,
      borderRadius: 8.525,
      territoryRadius: 6.525,
      borderType: UnitBorderType.Square,
    });
  }

  private loadIcon(unitType: string, config: UnitRenderConfig) {
    const image = new Image();
    image.src = config.icon;
    image.onload = () => {
      // Create temporary canvas for icon processing
      const tempCanvas = document.createElement("canvas");
      const tempContext = tempCanvas.getContext("2d");
      if (tempContext === null) throw new Error("2d context not supported");
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;

      // Draw the unit icon
      tempContext.drawImage(image, 0, 0);
      const iconData = tempContext.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height,
      );
      this.unitIcons.set(unitType, iconData);
      console.log(
        `icon data width height: ${iconData.width}, ${iconData.height}`,
      );
    };
  }

  private loadIconData() {
    Object.entries(this.unitConfigs).forEach(([unitType, config]) => {
      this.loadIcon(unitType, config);
    });
  }

  shouldTransform(): boolean {
    return true;
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    const unitUpdates = updates !== null ? updates[GameUpdateType.Unit] : [];
    for (const u of unitUpdates) {
      const unit = this.game.unit(u.id);
      if (unit === undefined) continue;
      this.handleUnitRendering(unit);
    }
  }

  init() {
    this.redraw();
  }

  redraw() {
    console.log("structure layer redrawing");
    this.canvas = document.createElement("canvas");
    const context = this.canvas.getContext("2d", { alpha: true });
    if (context === null) throw new Error("2d context not supported");
    this.context = context;
    this.canvas.width = this.game.width();
    this.canvas.height = this.game.height();
    this.game.units().forEach((u) => this.handleUnitRendering(u));
  }

  renderLayer(context: CanvasRenderingContext2D) {
    context.drawImage(
      this.canvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
  }

  private isUnitTypeSupported(unitType: UnitType): boolean {
    return unitType in this.unitConfigs;
  }

  private trackBuildingEvents(unit: UnitView) {
    const unitId = unit.id();
    const unitType = unit.constructionType() ?? unit.type();
    const isConstruction = unit.type() === UnitType.Construction;
    
    // Check for construction start
    if (isConstruction && !this.constructionUnits.has(unitId)) {
      this.constructionUnits.add(unitId);
      
      // Only play construction sounds for the current player's buildings
      const myPlayer = this.game.myPlayer();
      if (myPlayer && unit.owner() === myPlayer) {
        // Don't play generic building sound for vipers and condors (they have their own port activity sound)
        const constructionType = unit.constructionType();
        if (constructionType !== UnitType.Viper && constructionType !== UnitType.Condor) {
          const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
          this.soundManager.playBuildingConstruction(unitPosition);
        }
      }
      
      return; // Don't check for completion on the same tick
    }
    
    // Check for building completion (construction unit disappears, actual building appears)
    if (!isConstruction && this.isUnitTypeSupported(unitType) && !this.trackedUnits.has(unitId)) {
      this.trackedUnits.add(unitId);
      
      // Only play completion sounds for the current player's buildings
      const myPlayer = this.game.myPlayer();
      if (myPlayer && unit.owner() === myPlayer) {
        // Play appropriate completion sound
        const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
        switch (unitType) {
          case UnitType.Port:
            this.soundManager.playPortComplete(unitPosition);
            break;
          case UnitType.City:
            this.soundManager.playCityComplete(unitPosition);
            break;
          case UnitType.DefensePost:
            this.soundManager.playDefensePostComplete(unitPosition);
            break;
          case UnitType.MissileSilo:
            this.soundManager.playMissileSiloComplete(unitPosition);
            break;
          // Note: SAMLauncher and OrbitalCannon don't have specific completion sounds
          // but could use the general building completion sounds if needed
        }
      }
    }
    
    // Cleanup inactive units
    if (!unit.isActive()) {
      this.trackedUnits.delete(unitId);
      this.constructionUnits.delete(unitId);
    }
  }

  private drawBorder(
    unit: UnitView,
    borderColor: Colord,
    config: UnitRenderConfig,
    distanceFN: DistanceFunction,
  ) {
    const progress = unit.type() === UnitType.Construction ? unit.constructionProgress() : 1.0;
    
    // Get all border tiles
    const borderTiles = Array.from(this.game.bfs(
      unit.tile(),
      distanceFN(unit.tile(), config.borderRadius, true),
    ));
    
    // Sort tiles by Y coordinate (bottom to top)
    borderTiles.sort((a, b) => this.game.y(b) - this.game.y(a));
    
    // Calculate fill threshold based on progress
    const unitY = this.game.y(unit.tile());
    const maxY = Math.max(...borderTiles.map(t => this.game.y(t)));
    const minY = Math.min(...borderTiles.map(t => this.game.y(t)));
    const range = maxY - minY + 1;
    const fillThreshold = maxY - (range * progress);
    
    // Draw border with bottom-up fill
    borderTiles.forEach((tile) => {
      const cell = new Cell(this.game.x(tile), this.game.y(tile));
      const tileY = this.game.y(tile);
      
      if (unit.type() === UnitType.Construction) {
        if (tileY > fillThreshold) {
          // This tile is "filled" - use full player color
          this.paintCell(cell, borderColor, 255);
        } else {
          // This tile is "empty" - use gray
          this.paintCell(cell, underConstructionColor, 100);
        }
      } else {
        // Normal unit - full color
        this.paintCell(cell, borderColor, 255);
      }
    });

    // Draw territory with same bottom-up fill
    const territoryTiles = Array.from(this.game.bfs(
      unit.tile(),
      distanceFN(unit.tile(), config.territoryRadius, true),
    ));
    
    territoryTiles.forEach((tile) => {
      const cell = new Cell(this.game.x(tile), this.game.y(tile));
      const tileY = this.game.y(tile);
      
      if (unit.type() === UnitType.Construction) {
        if (tileY > fillThreshold) {
          // This tile is "filled" - use full player territory color
          this.paintCell(cell, this.theme.territoryColor(unit.owner()), 130);
        } else {
          // This tile is "empty" - use gray
          this.paintCell(cell, underConstructionColor, 50);
        }
      } else {
        this.paintCell(cell, this.theme.territoryColor(unit.owner()), 130);
      }
    });
  }

  private getDrawFN(type: UnitBorderType) {
    switch (type) {
      case UnitBorderType.Round:
        return euclDistFN;
      case UnitBorderType.Diamond:
        return manhattanDistFN;
      case UnitBorderType.Square:
        return rectDistFN;
      case UnitBorderType.Hexagon:
        return hexDistFN;
    }
  }

  private handleUnitRendering(unit: UnitView) {
    const unitId = unit.id();
    const unitType = unit.constructionType() ?? unit.type();
    const iconType = unitType;
    
    // Track construction starts and completions
    this.trackBuildingEvents(unit);
    
    if (!this.isUnitTypeSupported(unitType)) return;

    const config = this.unitConfigs[unitType];
    let icon: ImageData | undefined;

    if (unitType === UnitType.SAMLauncher && unit.isCooldown()) {
      icon = this.unitIcons.get("reloadingSam");
    } else if (unitType === UnitType.MissileSilo && unit.isCooldown()) {
      icon = this.unitIcons.get("reloadingSilo");
    } else {
      icon = this.unitIcons.get(iconType);
    }

    if (!config || !icon) return;

    const drawFunction = this.getDrawFN(config.borderType);
    // Clear previous rendering - use standard radius for all structures
    for (const tile of this.game.bfs(
      unit.tile(),
      drawFunction(unit.tile(), config.borderRadius, true),
    )) {
      this.clearCell(new Cell(this.game.x(tile), this.game.y(tile)));
    }

    if (!unit.isActive()) return;

    let borderColor = this.theme.borderColor(unit.owner());
    if (unitType === UnitType.SAMLauncher && unit.isCooldown()) {
      borderColor = reloadingColor;
    } else if (unitType === UnitType.MissileSilo && unit.isCooldown()) {
      borderColor = reloadingColor;
    } else if (unit.type() === UnitType.Construction) {
      borderColor = underConstructionColor;
    }

    this.drawBorder(unit, borderColor, config, drawFunction);

    const startX = this.game.x(unit.tile()) - Math.floor(icon.width / 2);
    const startY = this.game.y(unit.tile()) - Math.floor(icon.height / 2);
    // Draw the icon
    this.renderIcon(icon, startX, startY, icon.width, icon.height, unit);

    // Draw port queue timer if this is a port with an active queue
    if (unitType === UnitType.Port) {
      this.drawPortQueueTimer(unit, config);
    }
  }

  private renderIcon(
    iconData: ImageData,
    startX: number,
    startY: number,
    width: number,
    height: number,
    unit: UnitView,
  ) {
    const playerColor = this.theme.borderColor(unit.owner());
    let progress = 1.0; // Default to fully built
    
    if (unit.type() === UnitType.Construction) {
      progress = unit.constructionProgress();
    }
    
    // Calculate the fill height based on progress (fill from bottom to top)
    const fillHeight = Math.ceil(height * progress);
    const emptyHeight = height - fillHeight;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const iconIndex = (y * width + x) * 4;
        const alpha = iconData.data[iconIndex + 3];

        if (alpha > 0) {
          const targetX = startX + x;
          const targetY = startY + y;

          if (
            targetX >= 0 &&
            targetX < this.game.width() &&
            targetY >= 0 &&
            targetY < this.game.height()
          ) {
            if (unit.type() === UnitType.Construction) {
              // For construction units, show partial fill effect
              if (y >= emptyHeight) {
                // This part is "filled" - use full player color
                this.paintCell(new Cell(targetX, targetY), playerColor, alpha);
              } else {
                // This part is "empty" - use gray with lower opacity
                this.paintCell(new Cell(targetX, targetY), underConstructionColor, alpha * 0.4);
              }
            } else {
              // Normal units - full color
              this.paintCell(new Cell(targetX, targetY), playerColor, alpha);
            }
          }
        }
      }
    }
  }


  paintCell(cell: Cell, color: Colord, alpha: number) {
    this.clearCell(cell);
    this.context.fillStyle = color.alpha(alpha / 255).toRgbString();
    this.context.fillRect(cell.x, cell.y, 1, 1);
  }

  clearCell(cell: Cell) {
    this.context.clearRect(cell.x, cell.y, 1, 1);
  }

  private drawPortQueueTimer(unit: UnitView, config: UnitRenderConfig) {
    const centerX = this.game.x(unit.tile());
    const centerY = this.game.y(unit.tile());
    const timerRadius = 6; // Small radius inside the port icon

    // Only draw if there's an active queue
    if (!unit.hasPortQueue()) {
      return;
    }

    const portQueue = unit.portQueueUnitType();
    const progress = unit.portQueueProgress();

    if (!portQueue || progress === undefined) {
      return;
    }

    // Save the current context state
    this.context.save();

    // Set arc style - thicker line since it's smaller
    this.context.lineWidth = 2;
    this.context.lineCap = 'round';

    // Choose color based on unit type - bright colors for visibility inside the icon
    if (portQueue === UnitType.Viper) {
      this.context.strokeStyle = '#00BFFF'; // Bright blue for Viper
    } else if (portQueue === UnitType.Condor) {
      this.context.strokeStyle = '#FF4500'; // Bright red/orange for Condor
    } else {
      this.context.strokeStyle = '#FFFF00'; // Bright yellow fallback
    }

    // Draw progress arc (clockwise from 12 o'clock)
    const startAngle = -Math.PI / 2; // 12 o'clock
    const endAngle = startAngle + (progress * 2 * Math.PI);

    this.context.beginPath();
    this.context.arc(centerX, centerY, timerRadius, startAngle, endAngle);
    this.context.stroke();

    // Restore the context state
    this.context.restore();
  }
}
