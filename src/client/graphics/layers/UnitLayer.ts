import { colord, Colord } from "colord";
import { EventBus, GameEvent } from "../../../core/EventBus";
import { ClientID } from "../../../core/Schemas";
import { Theme } from "../../../core/configuration/Config";
import { Cell, UnitType } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, PlayerView, UnitView } from "../../../core/game/GameView";
import { BezenhamLine } from "../../../core/utilities/Line";
import {
  AlternateViewEvent,
  MouseUpEvent,
  UnitSelectionEvent,
  SelectionBoxStartEvent,
  SelectionBoxUpdateEvent,
  SelectionBoxEndEvent,
} from "../../InputHandler";
import { MoveWarshipIntentEvent, BatchMoveWarshipsIntentEvent } from "../../Transport";

// Event for multi-unit selection
export class MultiUnitSelectionEvent implements GameEvent {
  constructor(public readonly units: Set<UnitView>) {}
}
import { TransformHandler } from "../TransformHandler";
import { CoordinateTransformer } from "../CoordinateTransformer";
import { Layer } from "./Layer";
import { SoundManager } from "../../soundeffects/effects/SoundManager";
import { MultiSelectModeEvent } from "./MultiSelectButton";

import {
  getColoredSprite,
  isSpriteReady,
  loadAllSprites,
} from "../SpriteLoader";

enum Relationship {
  Self,
  Ally,
  Enemy,
}

enum Direction {
  N, // 0° = north (up)
  E, // 90° = east (right)
  S, // 180° = south (down)
  W, // 270° = west (left)
}

type TrailPoint = {
  x: number;
  y: number;
};

type Explosion = {
  x: number;
  y: number;
  frame: number;
  maxFrames: number;
  color: Colord;
  unitType: UnitType; // Track if it's a Viper or Condor explosion
};

export class UnitLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private transportShipTrailCanvas: HTMLCanvasElement;
  private unitTrailContext: CanvasRenderingContext2D;

  private theme: Theme;

  private alternateView = false;

  private myPlayer: PlayerView | null = null;

  private oldShellTile = new Map<UnitView, TileRef>();
  private oldMissileTile = new Map<UnitView, TileRef>();

  private transformHandler: TransformHandler;
  private coordinateTransformer: CoordinateTransformer;

  // Selected unit property as suggested in the review comment
  private selectedUnit: UnitView | null = null;
  private selectedUnits: Set<UnitView> = new Set();
  private multiSelectMode = false;

  // Selection box for multi-select
  private selectionBox: {
    startCell: Cell;
    endCell: Cell;
    screenStartX: number;
    screenStartY: number;
    screenEndX: number;
    screenEndY: number;
  } | null = null;
  private selectionCanvas: HTMLCanvasElement;
  private selectionContext: CanvasRenderingContext2D;

  // Track last logged position to prevent spam
  private lastLoggedSelectionBox: { x: number; y: number; w: number; h: number } | null = null;


  // Configuration for unit selection
  private readonly WARSHIP_SELECTION_RADIUS = 10; // Radius in game cells for warship selection hit zone

  // Unit bounding box sizes for selection (in game units)
  private readonly UNIT_BOUNDING_BOX_SIZES = new Map<UnitType, number>([
    [UnitType.Viper, 1.5],    // Smaller warship
    [UnitType.Condor, 2.0],   // Larger warship
    [UnitType.TransportShip, 1.8],  // Transport ship
    [UnitType.TradeShip, 1.8],      // Trade ship
  ]);

  /**
   * Get the bounding box size for a unit type
   */
  private getUnitBoundingBoxSize(unitType: UnitType): number {
    return this.UNIT_BOUNDING_BOX_SIZES.get(unitType) || 1.0;
  }

  private unitToTrail = new Map<UnitView, TileRef[]>();

  private explosions: Explosion[] = [];
  
  // Track unit states for sound triggering
  private unitStates = new Map<number, { wasActive: boolean; wasAttacking: boolean }>();
  private soundManager = SoundManager.getInstance();

  // Move marker state
  private moveMarkerTarget: TileRef | null = null;
  private moveMarkerTimer = 0;
  private readonly MOVE_MARKER_DURATION = 12; // 0.2 seconds at 60 ticks/sec
  private lastMarkerX: number | null = null;
  private lastMarkerY: number | null = null;


  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private clientID: ClientID,
    transformHandler: TransformHandler,
  ) {
    this.theme = game.config().theme();
    this.transformHandler = transformHandler;

    // Initialize sound manager with transform handler for spatial audio
    this.soundManager.setTransformHandler(transformHandler);

    // Create selection canvas for drawing selection box
    this.selectionCanvas = document.createElement('canvas');
    this.selectionCanvas.style.position = 'fixed'; // Match game canvas positioning
    this.selectionCanvas.style.top = '0';
    this.selectionCanvas.style.left = '0';
    this.selectionCanvas.style.pointerEvents = 'none';
    this.selectionCanvas.style.zIndex = '1001';
    this.selectionContext = this.selectionCanvas.getContext('2d')!;

    // Initialize coordinate transformer with proper getters
    this.coordinateTransformer = new CoordinateTransformer(
      this.selectionCanvas,
      () => this.transformHandler.scale,
      () => (this.transformHandler as any).offsetX || 0,
      () => (this.transformHandler as any).offsetY || 0,
      () => this.game.width(),
      () => this.game.height()
    );
  }

  shouldTransform(): boolean {
    return true;
  }

  tick() {
    if (this.myPlayer === null) {
      this.myPlayer = this.game.playerByClientID(this.clientID);
    }

    // Update move marker timer and draw (before units so units appear on top)
    if (this.moveMarkerTimer > 0) {
      this.moveMarkerTimer--;
      this.drawMoveMarker();

      // Clear marker target when timer expires
      if (this.moveMarkerTimer === 0) {
        // Clear the final marker position
        if (this.lastMarkerX !== null && this.lastMarkerY !== null) {
          this.context.clearRect(
            this.lastMarkerX - 7,
            this.lastMarkerY - 7,
            14,
            14
          );
          this.lastMarkerX = null;
          this.lastMarkerY = null;
        }
        this.moveMarkerTarget = null;
      }
    }

    // Draw units and explosions after marker
    this.updateUnitsSprites();
    this.updateExplosions();
  }

  init() {
    this.eventBus.on(AlternateViewEvent, (e) => this.onAlternativeViewEvent(e));
    this.eventBus.on(MouseUpEvent, (e) => this.onMouseUp(e));
    this.eventBus.on(UnitSelectionEvent, (e) => this.onUnitSelectionChange(e));
    this.eventBus.on(SelectionBoxStartEvent, (e) => this.onSelectionBoxStart(e));
    this.eventBus.on(SelectionBoxUpdateEvent, (e) => this.onSelectionBoxUpdate(e));
    this.eventBus.on(SelectionBoxEndEvent, (e) => this.onSelectionBoxEnd(e));
    this.redraw();

    loadAllSprites();

    // Setup selection canvas
    document.body.appendChild(this.selectionCanvas);
    this.updateSelectionCanvasSize();
    window.addEventListener('resize', () => this.updateSelectionCanvasSize());
  }

  /**
   * Find player-owned warships near the given cell within a configurable radius
   * @param cell The cell to check
   * @returns Array of player's warships in range, sorted by distance (closest first)
   */
  private findWarshipsNearCell(cell: { x: number; y: number }): UnitView[] {
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      // The cell coordinate were invalid (user probably clicked outside the map), therefore no warships can be found
      return [];
    }
    const clickRef = this.game.ref(cell.x, cell.y);

    // Make sure we have the current player
    if (this.myPlayer === null) {
      this.myPlayer = this.game.playerByClientID(this.clientID);
    }

    // Only select warships owned by the player
    return this.game
      .units(UnitType.Viper, UnitType.Condor)
      .filter(
        (unit) =>
          unit.isActive() &&
          unit.owner() === this.myPlayer && // Only allow selecting own warships
          this.game.manhattanDist(unit.tile(), clickRef) <=
            this.WARSHIP_SELECTION_RADIUS,
      )
      .sort((a, b) => {
        // Sort by distance (closest first)
        const distA = this.game.manhattanDist(a.tile(), clickRef);
        const distB = this.game.manhattanDist(b.tile(), clickRef);
        return distA - distB;
      });
  }

  private onMouseUp(event: MouseUpEvent) {
    // Convert screen coordinates to world coordinates
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );

    // If we have multiple selected units, handle batch movement
    if (this.selectedUnits.size > 0) {
      const clickRef = this.game.ref(cell.x, cell.y);

      // Allow movement to any tile (land or water) for amphibious warships
      // Move all selected units to the same target tile (like single unit movement)
      const movements: Array<{ unitId: number; targetTile: number }> = [];
      const unitsArray = Array.from(this.selectedUnits);

      // Send each unit to the same clicked tile
      unitsArray.forEach(unit => {
        movements.push({ unitId: unit.id(), targetTile: clickRef });
      });

      if (movements.length > 0) {
        this.eventBus.emit(new BatchMoveWarshipsIntentEvent(movements));
        // Turn off multi-select mode after issuing command
        this.eventBus.emit(new MultiSelectModeEvent(false));

        // Set move marker at target position
        this.moveMarkerTarget = clickRef;
        this.moveMarkerTimer = this.MOVE_MARKER_DURATION;
      }
      // Clear selection and notify UILayer
      this.clearSelection();
      return;
    }

    // Find warships near this cell, sorted by distance
    const nearbyWarships = this.findWarshipsNearCell(cell);

    if (this.selectedUnit) {
      const clickRef = this.game.ref(cell.x, cell.y);
      // Allow movement to any tile (land or water) for amphibious warships
      this.eventBus.emit(
        new MoveWarshipIntentEvent(this.selectedUnit.id(), clickRef),
      );

      // Set move marker at target position
      this.moveMarkerTarget = clickRef;
      this.moveMarkerTimer = this.MOVE_MARKER_DURATION;

      // Deselect
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    } else if (nearbyWarships.length > 0) {
      // Toggle selection of the closest warship
      const clickedUnit = nearbyWarships[0];
      this.eventBus.emit(new UnitSelectionEvent(clickedUnit, true));
    }
  }

  /**
   * Handle unit selection changes
   */
  private onUnitSelectionChange(event: UnitSelectionEvent) {
    if (event.isSelected) {
      this.selectedUnit = event.unit;
    } else if (this.selectedUnit === event.unit) {
      this.selectedUnit = null;
    }
  }

  /**
   * Handle unit deactivation or destruction
   * If the selected unit is removed from the game, deselect it
   */
  private handleUnitDeactivation(unit: UnitView) {
    // Don't try to clear trails for warships
    if (
      unit.type() !== UnitType.Viper &&
      this.selectedUnit === unit &&
      !unit.isActive()
    ) {
      this.eventBus.emit(new UnitSelectionEvent(unit, false));
    }

    // Remove from multi-selection if needed
    if (this.selectedUnits.has(unit) && !unit.isActive()) {
      this.selectedUnits.delete(unit);
    }

    // Clean up missile tracking when deactivated
    if (unit.type() === UnitType.SAMMissile && !unit.isActive()) {
      this.oldMissileTile.delete(unit);
    }
  }

  private onSelectionBoxStart(event: SelectionBoxStartEvent) {
    console.log(`[SELECTION DEBUG] Box start received - cell=${event.startCell}`);
    this.multiSelectMode = true;
    this.clearSelection();
    this.selectionBox = {
      startCell: event.startCell,
      endCell: event.startCell,
      screenStartX: event.screenX,
      screenStartY: event.screenY,
      screenEndX: event.screenX,
      screenEndY: event.screenY
    };
  }

  private onSelectionBoxUpdate(event: SelectionBoxUpdateEvent) {
    if (!this.selectionBox) return;

    this.selectionBox.endCell = event.endCell;
    this.selectionBox.screenEndX = event.screenEndX;
    this.selectionBox.screenEndY = event.screenEndY;

    // Draw selection box
    this.drawSelectionBox();

    // Preview which units will be selected
    this.updateSelectedUnitsPreview();
  }

  private onSelectionBoxEnd(event: SelectionBoxEndEvent) {
    if (!this.selectionBox) {
      return;
    }

    // Use the cell coordinates from the event
    const startCell = event.startCell;
    const endCell = event.endCell;

    // Find all warships in the selection box
    const minX = Math.min(startCell.x, endCell.x);
    const maxX = Math.max(startCell.x, endCell.x);
    const minY = Math.min(startCell.y, endCell.y);
    const maxY = Math.max(startCell.y, endCell.y);

    // Always clear and replace selection
    this.clearSelection();

    const warships = [...this.game.units(UnitType.Viper), ...this.game.units(UnitType.Condor)];

    // Find units in selection box using bounding box detection
    warships.forEach(unit => {
      if (!unit.isActive() || unit.owner() !== this.myPlayer) return;

      // Get unit bounding box (using a configurable size)
      const unitX = this.game.x(unit.tile());
      const unitY = this.game.y(unit.tile());
      const unitSize = this.getUnitBoundingBoxSize(unit.type());

      // Check if unit bounding box intersects with selection rectangle
      const unitMinX = unitX - unitSize / 2;
      const unitMaxX = unitX + unitSize / 2;
      const unitMinY = unitY - unitSize / 2;
      const unitMaxY = unitY + unitSize / 2;

      // AABB intersection test
      const intersects = !(unitMaxX < minX || unitMinX > maxX || unitMaxY < minY || unitMinY > maxY);

      if (intersects) {
        this.selectedUnits.add(unit);
      }
    });

    // Clear selection box
    this.selectionBox = null;
    this.clearSelectionBox();
    this.multiSelectMode = false;

    // Emit event for multi-unit selection
    this.eventBus.emit(new MultiUnitSelectionEvent(new Set(this.selectedUnits)));
  }

  private clearSelection() {
    this.selectedUnits.clear();
    if (this.selectedUnit) {
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    }
    // Clear multi-selection
    this.eventBus.emit(new MultiUnitSelectionEvent(new Set()));
  }

  private updateSelectedUnitsPreview() {
    if (!this.selectionBox) return;

    // Use the cell coordinates from the selection box
    const startCell = this.selectionBox.startCell;
    const endCell = this.selectionBox.endCell;

    const minX = Math.min(startCell.x, endCell.x);
    const maxX = Math.max(startCell.x, endCell.x);
    const minY = Math.min(startCell.y, endCell.y);
    const maxY = Math.max(startCell.y, endCell.y);

    // Temporarily highlight units that would be selected
    this.selectedUnits.clear();

    const warships = [...this.game.units(UnitType.Viper), ...this.game.units(UnitType.Condor)];
    warships.forEach(unit => {
      if (!unit.isActive() || unit.owner() !== this.myPlayer) return;

      const unitX = this.game.x(unit.tile());
      const unitY = this.game.y(unit.tile());

      if (unitX >= minX && unitX <= maxX && unitY >= minY && unitY <= maxY) {
        this.selectedUnits.add(unit);
      }
    });
  }

  private drawSelectionBox() {
    if (!this.selectionBox) return;

    this.selectionContext.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);

    // Get both canvas bounding rects for debugging
    const gameCanvasRect = this.transformHandler.boundingRect();
    const selectionCanvasRect = this.selectionCanvas.getBoundingClientRect();

    // Debug: Log canvas positions
    if (!this.lastLoggedSelectionBox) {
      console.log(`[CANVAS DEBUG] Game canvas: left=${gameCanvasRect.left.toFixed(2)}, top=${gameCanvasRect.top.toFixed(2)}`);
      console.log(`[CANVAS DEBUG] Selection canvas: left=${selectionCanvasRect.left.toFixed(2)}, top=${selectionCanvasRect.top.toFixed(2)}`);
    }

    // Use the stored screen coordinates and adjust for the selection canvas position
    // The selection canvas is at viewport (0,0), so we need to subtract the game canvas offset
    const startX = this.selectionBox.screenStartX - gameCanvasRect.left;
    const startY = this.selectionBox.screenStartY - gameCanvasRect.top;
    const endX = this.selectionBox.screenEndX - gameCanvasRect.left;
    const endY = this.selectionBox.screenEndY - gameCanvasRect.top;

    // Alternative: Try using world coordinates converted to canvas coordinates
    const worldStart = this.coordinateTransformer.worldToCanvas(this.selectionBox.startCell.x, this.selectionBox.startCell.y);
    const worldEnd = this.coordinateTransformer.worldToCanvas(this.selectionBox.endCell.x, this.selectionBox.endCell.y);

    // Calculate the rectangle bounds
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Only log if position changed by at least 1 pixel (rounded values)
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const roundedW = Math.round(width);
    const roundedH = Math.round(height);

    if (!this.lastLoggedSelectionBox ||
        this.lastLoggedSelectionBox.x !== roundedX ||
        this.lastLoggedSelectionBox.y !== roundedY ||
        this.lastLoggedSelectionBox.w !== roundedW ||
        this.lastLoggedSelectionBox.h !== roundedH) {

      // Format with 2 decimal places for clean output
      console.log(`[SELECTION DEBUG] Visual rectangle drawn - start=${this.selectionBox.startCell}, end=${this.selectionBox.endCell}, screen(x=${x.toFixed(2)}, y=${y.toFixed(2)}, w=${width.toFixed(2)}, h=${height.toFixed(2)})`);
      console.log(`[COORD DEBUG] ScreenCoords method: x=${x.toFixed(2)}, y=${y.toFixed(2)}`);
      console.log(`[COORD DEBUG] WorldToCanvas method: startX=${worldStart.x.toFixed(2)}, startY=${worldStart.y.toFixed(2)}, endX=${worldEnd.x.toFixed(2)}, endY=${worldEnd.y.toFixed(2)}`);

      // Calculate where the visual rect should appear based on the cells
      const expectedStart = this.transformHandler.worldToScreenCoordinates(this.selectionBox.startCell);
      console.log(`[COORD DEBUG] Expected screen pos for cell: x=${expectedStart.x.toFixed(2)}, y=${expectedStart.y.toFixed(2)}`);

      this.lastLoggedSelectionBox = { x: roundedX, y: roundedY, w: roundedW, h: roundedH };
    }

    // Draw selection box with improved visuals
    // Fill with semi-transparent neon green (15% opacity as per spec)
    this.selectionContext.fillStyle = 'rgba(57, 255, 20, 0.15)';
    this.selectionContext.fillRect(x, y, width, height);

    // Draw border with solid neon green (80% opacity)
    this.selectionContext.strokeStyle = 'rgba(57, 255, 20, 0.8)';
    this.selectionContext.lineWidth = 2;
    this.selectionContext.strokeRect(x, y, width, height);
  }

  private clearSelectionBox() {
    this.selectionContext.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
    this.lastLoggedSelectionBox = null; // Reset tracking when selection is cleared
  }

  private updateSelectionCanvasSize() {
    // Simple approach: cover entire viewport
    this.selectionCanvas.width = window.innerWidth;
    this.selectionCanvas.height = window.innerHeight;
  }

  private drawSelectionHighlight(unit: UnitView) {
    const x = this.game.x(unit.tile());
    const y = this.game.y(unit.tile());

    // Draw selection circle around the unit - neon green
    this.context.strokeStyle = 'rgba(57, 255, 20, 0.8)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(x, y, 12, 0, Math.PI * 2);
    this.context.stroke();

    // Draw a smaller inner circle for better visibility - neon green
    this.context.strokeStyle = 'rgba(57, 255, 20, 0.4)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.arc(x, y, 8, 0, Math.PI * 2);
    this.context.stroke();
  }

  renderLayer(context: CanvasRenderingContext2D) {
    context.drawImage(
      this.transportShipTrailCanvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
    context.drawImage(
      this.canvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
  }

  onAlternativeViewEvent(event: AlternateViewEvent) {
    this.alternateView = event.alternateView;
    this.redraw();
  }

  redraw() {
    this.canvas = document.createElement("canvas");
    const context = this.canvas.getContext("2d");
    if (context === null) throw new Error("2d context not supported");
    this.context = context;
    this.transportShipTrailCanvas = document.createElement("canvas");
    const trailContext = this.transportShipTrailCanvas.getContext("2d");
    if (trailContext === null) throw new Error("2d context not supported");
    this.unitTrailContext = trailContext;

    this.canvas.width = this.game.width();
    this.canvas.height = this.game.height();
    this.transportShipTrailCanvas.width = this.game.width();
    this.transportShipTrailCanvas.height = this.game.height();

    this.updateUnitsSprites();

    this.unitToTrail.forEach((trail, unit) => {
      for (const t of trail) {
        this.paintCell(
          this.game.x(t),
          this.game.y(t),
          this.relationship(unit),
          this.theme.territoryColor(unit.owner()),
          150,
          this.unitTrailContext,
        );
      }
    });
  }

  private updateUnitsSprites() {
    const unitUpdates = this.game.updatesSinceLastTick()?.[GameUpdateType.Unit];
    if (!unitUpdates) return;

    // Get the units and filter out undefined ones
    const unitsToProcess = unitUpdates
      .map((unit) => this.game.unit(unit.id))
      .filter((unitView) => unitView !== undefined) as UnitView[];

    // If a Viper or Condor is updated, we need to redraw all Vipers/Condors on its current and last tile
    const additionalUnitsToRedraw = new Map<number, UnitView>();

    for (const unit of unitsToProcess) {
      if (unit.type() === UnitType.Viper || unit.type() === UnitType.Condor) {
        const tilesToCheck: TileRef[] = [];
        if (unit.tile()) tilesToCheck.push(unit.tile());
        if (unit.lastTile() && unit.lastTile() !== unit.tile())
          tilesToCheck.push(unit.lastTile());

        for (const tile of tilesToCheck) {
          const unitsAtTile = [
            ...this.game.units(UnitType.Viper),
            ...this.game.units(UnitType.Condor),
          ].filter((u) => u.isActive() && u.tile() === tile);

          for (const u of unitsAtTile) {
            if (!additionalUnitsToRedraw.has(u.id())) {
              additionalUnitsToRedraw.set(u.id(), u);
            }
          }
        }
      }
    }

    // Combine original updated units with any additional units that need redrawing for stacking
    const finalUnitsMap = new Map<number, UnitView>();
    unitsToProcess.forEach((u) => finalUnitsMap.set(u.id(), u));
    additionalUnitsToRedraw.forEach((u) => finalUnitsMap.set(u.id(), u));

    const finalUnitsToRedraw = Array.from(finalUnitsMap.values());

    // Sort units to ensure consistent draw order and prevent z-fighting
    finalUnitsToRedraw.sort((a, b) => {
      // Primary sort: by tile position for spatial consistency
      const aTile = a.tile();
      const bTile = b.tile();
      if (aTile !== bTile) {
        return aTile - bTile;
      }

      // Secondary sort: by unit ID for stable ordering when positions are identical
      // This ensures the same unit always draws on top when multiple units overlap
      return a.id() - b.id();
    });

    // Process units in the stable sorted order
    finalUnitsToRedraw.forEach((unitView) => {
      const ready = isSpriteReady(unitView.type());
      if (ready) this.clearUnitCells(unitView);
      this.onUnitEvent(unitView);
    });
  }

  private clearUnitCells(unit: UnitView) {
    const sprite = getColoredSprite(unit, this.theme);

    // Use smaller clear size for Condors and SAM missiles
    let clearsize: number;
    if (unit.type() === UnitType.Condor) {
      clearsize = 23; // Custom size for Condors
    } else if (unit.type() === UnitType.SAMMissile) {
      clearsize = 5; // Very small size for SAM missiles to prevent black box overlap
    } else {
      // Clear an area large enough to cover the sprite even when rotated (diagonal)
      clearsize = Math.ceil(sprite.width * Math.SQRT2) + 1;
    }

    const lastX = this.game.x(unit.lastTile());
    const lastY = this.game.y(unit.lastTile());
    this.context.clearRect(
      lastX - clearsize / 2,
      lastY - clearsize / 2,
      clearsize,
      clearsize,
    );
  }

  private relationship(unit: UnitView): Relationship {
    if (this.myPlayer === null) {
      return Relationship.Enemy;
    }
    if (this.myPlayer === unit.owner()) {
      return Relationship.Self;
    }
    if (this.myPlayer.isFriendly(unit.owner())) {
      return Relationship.Ally;
    }
    return Relationship.Enemy;
  }

  private onUnitEvent(unit: UnitView) {
    // Check if unit was deactivated
    if (!unit.isActive()) {
      this.handleUnitDeactivation(unit);
    }

    switch (unit.type()) {
      case UnitType.TransportShip:
        this.handleBoatEvent(unit);
        break;
      case UnitType.Viper:
        // Clear an 11x11 area around the warship's last position
        if (unit.lastTile()) {
          const lastX = this.game.x(unit.lastTile());
          const lastY = this.game.y(unit.lastTile());
          this.unitTrailContext.clearRect(lastX - 5, lastY - 5, 11, 11);
        }
        this.handleWarShipEvent(unit);
        break;
      case UnitType.Condor:
        // Clear a 5x5 area around the condor's last position (testing minimal size)
        if (unit.lastTile()) {
          const lastX = this.game.x(unit.lastTile());
          const lastY = this.game.y(unit.lastTile());
          this.unitTrailContext.clearRect(lastX - 2, lastY - 2, 5, 5);
        }
        this.handleWarShipEvent(unit);
        break;
      case UnitType.Shell:
        this.handleShellEvent(unit);
        break;
      case UnitType.SAMMissile:
        this.handleMissileEvent(unit);
        break;
      case UnitType.TradeShip:
        this.handleTradeShipEvent(unit);
        break;
      case UnitType.MIRVWarhead:
        this.handleMIRVWarhead(unit);
        break;
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb:
      case UnitType.MIRV:
        this.handleNuke(unit);
        break;
    }
  }

  private handleWarShipEvent(unit: UnitView) {
    const unitId = unit.id();
    const currentState = this.unitStates.get(unitId);
    
    
    // Check if this is a new viper or condor being created
    if (!currentState && unit.isActive() && (unit.type() === UnitType.Viper || unit.type() === UnitType.Condor)) {
      const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
      this.soundManager.playPortActivity(unitPosition);
    }
    
    // Check if the warship or building just died (was active before but not now)
    if (!unit.isActive()) {
      // Play elimination sound if unit was previously active
      if (currentState?.wasActive) {
        if (unit.type() === UnitType.Viper ||
            unit.type() === UnitType.Condor ||
            unit.type() === UnitType.City ||
            unit.type() === UnitType.Port ||
            unit.type() === UnitType.DefensePost ||
            unit.type() === UnitType.MissileSilo ||
            unit.type() === UnitType.SAMLauncher ||
            unit.type() === UnitType.OrbitalCannon) {
          const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
          this.soundManager.playUnitDestruction(unitPosition);
        }
      }

      // Create explosion at the unit's last known position
      const x = this.game.x(unit.lastTile());
      const y = this.game.y(unit.lastTile());

      this.explosions.push({
        x: x,
        y: y,
        frame: 0,
        maxFrames: 8, // Shorter for retro feel
        color: this.theme.territoryColor(unit.owner()),
        unitType: unit.type(),
      });
      return; // Don't draw dead units
    }
    
    
    // Update unit state tracking
    this.unitStates.set(unitId, {
      wasActive: unit.isActive(),
      wasAttacking: unit.targetUnitId() !== null
    });

    // Clear the previous sprite area on the main canvas
    this.clearUnitCells(unit);

    // After clearing, redraw any other warships that might be at the cleared position
    // This prevents seeing transparent background when units overlap
    if (unit.lastTile()) {
      const lastX = this.game.x(unit.lastTile());
      const lastY = this.game.y(unit.lastTile());

      // Check for units within the clear area + sprite radius
      // Clear area for Condors is 23x23, so radius is ~12
      // Sprite is 21x18, so we need to check further to catch edge overlaps
      const overlapRadius = 24; // Covers clear area (12) + full sprite width (12) for edge cases

      const unitsNearLastPosition = [
        ...this.game.units(UnitType.Viper),
        ...this.game.units(UnitType.Condor),
      ].filter((u) => {
        if (!u.isActive() || u === unit) return false;
        const unitX = this.game.x(u.tile());
        const unitY = this.game.y(u.tile());
        const dx = Math.abs(unitX - lastX);
        const dy = Math.abs(unitY - lastY);
        // Use square distance check to catch corner cases
        return dx <= overlapRadius && dy <= overlapRadius;
      });

      // Sort by tile position and ID for consistent ordering
      unitsNearLastPosition.sort((a, b) => {
        if (a.tile() !== b.tile()) {
          return a.tile() - b.tile();
        }
        return a.id() - b.id();
      });

      // Redraw units at the old position to fill any transparent holes
      unitsNearLastPosition.forEach((u) => {
        if (u.targetUnitId()) {
          this.drawSprite(u, colord({ r: 200, b: 0, g: 0 }));
        } else {
          this.drawSprite(u);
        }
      });
    }

    // Draw the sprite with appropriate color (targeting or not)
    if (unit.targetUnitId()) {
      this.drawSprite(unit, colord({ r: 200, b: 0, g: 0 }));
    } else {
      this.drawSprite(unit);
    }

    // Don't draw green circle highlight for multi-selected units
    // The UILayer will handle the proper selection box rendering
  }

  private handleShellEvent(unit: UnitView) {
    const unitId = unit.id();
    const currentState = this.unitStates.get(unitId);
    
    // Check if this is a new shell being created (play firing sound)
    if (!currentState && unit.isActive()) {
      const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
      this.soundManager.playShipFiring(unitPosition);
    }
    
    // Update shell state tracking
    this.unitStates.set(unitId, {
      wasActive: unit.isActive(),
      wasAttacking: false // Shells don't attack, they just move
    });
    
    const rel = this.relationship(unit);

    // Clear current and previous positions
    this.clearCell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
    const oldTile = this.oldShellTile.get(unit);
    if (oldTile !== undefined) {
      this.clearCell(this.game.x(oldTile), this.game.y(oldTile));
    }

    this.oldShellTile.set(unit, unit.lastTile());
    if (!unit.isActive()) {
      return;
    }

    // Paint current and previous positions
    this.paintCell(
      this.game.x(unit.tile()),
      this.game.y(unit.tile()),
      rel,
      this.theme.borderColor(unit.owner()),
      255,
    );
    this.paintCell(
      this.game.x(unit.lastTile()),
      this.game.y(unit.lastTile()),
      rel,
      this.theme.borderColor(unit.owner()),
      255,
    );
  }

  // interception missle from SAM
  private handleMissileEvent(unit: UnitView) {
    const unitId = unit.id();
    const currentState = this.unitStates.get(unitId);
    
    // Check if this is a new missile being created (play firing sound)
    if (!currentState && unit.isActive()) {
      const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
      this.soundManager.playShipFiring(unitPosition);
    }
    
    // No sounds for missile hits/intercepts
    
    // Update unit state tracking
    this.unitStates.set(unitId, {
      wasActive: unit.isActive(),
      wasAttacking: false
    });
    
    // Clear current and previous positions first
    this.clearUnitCells(unit);

    // Clear the old position if we have one tracked
    const oldTile = this.oldMissileTile.get(unit);
    if (oldTile !== undefined) {
      const oldX = this.game.x(oldTile);
      const oldY = this.game.y(oldTile);
      // Clear a 5x5 area at the old position
      this.context.clearRect(oldX - 2, oldY - 2, 5, 5);
    }

    // Update the old position tracking
    this.oldMissileTile.set(unit, unit.lastTile());

    // After clearing, redraw any other missiles AND warships that might be at the cleared positions
    // This prevents seeing transparent background when missiles overlap with other units
    const tilesToCheck: TileRef[] = [];
    if (unit.lastTile()) tilesToCheck.push(unit.lastTile());
    if (oldTile !== undefined && oldTile !== unit.lastTile())
      tilesToCheck.push(oldTile);

    for (const tile of tilesToCheck) {
      const tileX = this.game.x(tile);
      const tileY = this.game.y(tile);

      // Check for units within the clear area + sprite radius
      // SAM missiles have a very small clear area (5x5), so use a small radius
      const overlapRadius = 8; // Small radius since clear area is only 5x5

      // Check for other missiles
      const missilesNearPosition = this.game
        .units(UnitType.SAMMissile)
        .filter((u) => {
          if (!u.isActive() || u === unit) return false;
          const unitX = this.game.x(u.tile());
          const unitY = this.game.y(u.tile());
          const dx = Math.abs(unitX - tileX);
          const dy = Math.abs(unitY - tileY);
          return dx <= overlapRadius && dy <= overlapRadius;
        });

      // Also check for warships (Condors and Vipers) that might be underneath
      const warshipsNearPosition = [
        ...this.game.units(UnitType.Viper),
        ...this.game.units(UnitType.Condor),
      ].filter((u) => {
        if (!u.isActive()) return false;
        const unitX = this.game.x(u.tile());
        const unitY = this.game.y(u.tile());
        const dx = Math.abs(unitX - tileX);
        const dy = Math.abs(unitY - tileY);
        return dx <= overlapRadius && dy <= overlapRadius;
      });

      // Combine and sort all units for consistent ordering
      const allUnitsToRedraw = [
        ...missilesNearPosition,
        ...warshipsNearPosition,
      ];
      allUnitsToRedraw.sort((a, b) => {
        // Warships should be drawn before missiles
        if (
          (a.type() === UnitType.Viper || a.type() === UnitType.Condor) &&
          b.type() === UnitType.SAMMissile
        )
          return -1;
        if (
          a.type() === UnitType.SAMMissile &&
          (b.type() === UnitType.Viper || b.type() === UnitType.Condor)
        )
          return 1;

        // Otherwise sort by position and ID
        if (a.tile() !== b.tile()) {
          return a.tile() - b.tile();
        }
        return a.id() - b.id();
      });

      // Redraw all units at the old position to fill any transparent holes
      allUnitsToRedraw.forEach((u) => {
        if (
          (u.type() === UnitType.Viper || u.type() === UnitType.Condor) &&
          u.targetUnitId()
        ) {
          this.drawSprite(u, colord({ r: 200, b: 0, g: 0 }));
        } else {
          this.drawSprite(u);
        }
      });
    }

    // If missile is no longer active, clean up and return (don't draw it)
    if (!unit.isActive()) {
      this.oldMissileTile.delete(unit);
      return;
    }

    // Draw the missile sprite
    this.drawSprite(unit);
  }

  private sternOffset(theta: number): { dx: number; dy: number } {
    // Convert angle to closest cardinal direction
    // theta is in radians, 0 = up, positive = clockwise
    const deg = ((theta * 180) / Math.PI + 360) % 360;
    if (deg >= 315 || deg < 45) return { dx: 0, dy: -2 }; // North
    if (deg >= 45 && deg < 135) return { dx: 2, dy: 0 }; // East
    if (deg >= 135 && deg < 225) return { dx: 0, dy: 2 }; // South
    return { dx: -2, dy: 0 }; // West
  }

  private handleNuke(unit: UnitView) {
    const rel = this.relationship(unit);
    const unitId = unit.id();
    const currentState = this.unitStates.get(unitId);

    // Check if the nuke just detonated (was active before but not now)
    if (!unit.isActive()) {
      // Play nuclear explosion sound if unit was previously active
      if (currentState?.wasActive) {
        const unitPosition = new Cell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));
        if (unit.type() === UnitType.AtomBomb) {
          this.soundManager.playNukeDetonation(unitPosition);
        } else if (unit.type() === UnitType.HydrogenBomb) {
          this.soundManager.playHydrogenBombImpact(unitPosition);
        }
      }
      
      // Create mushroom cloud explosion at the nuke's last known position
      const x = this.game.x(unit.lastTile());
      const y = this.game.y(unit.lastTile());

      this.explosions.push({
        x: x,
        y: y,
        frame: 0,
        maxFrames: 12, // Longer animation for dramatic mushroom cloud effect
        color: this.theme.territoryColor(unit.owner()),
        unitType: unit.type(),
      });

      // Clear the trail since nuke has detonated
      this.clearTrail(unit);
      return; // Don't draw dead nukes
    }
    
    // Check if this is a newly launched nuke
    if (!currentState && unit.isActive()) {
      // Play missile deploy sound for nuclear weapons (Atom Bomb and Hydrogen Bomb)
      if (unit.type() === UnitType.AtomBomb || unit.type() === UnitType.HydrogenBomb) {
        this.soundManager.playMissileLaunch(this.game.cell(unit.tile()));
      }
    }
    
    // Update unit state tracking
    this.unitStates.set(unitId, {
      wasActive: unit.isActive(),
      wasAttacking: false // Nukes don't attack in the traditional sense
    });

    if (!this.unitToTrail.has(unit)) {
      this.unitToTrail.set(unit, []);
    }

    let newTrailSize = 1;
    const trail = this.unitToTrail.get(unit) ?? [];
    // It can move faster than 1 pixel, draw a line for the trail or else it will be dotted
    if (trail.length >= 1) {
      const cur = {
        x: this.game.x(unit.lastTile()),
        y: this.game.y(unit.lastTile()),
      };
      const prev = {
        x: this.game.x(trail[trail.length - 1]),
        y: this.game.y(trail[trail.length - 1]),
      };
      const line = new BezenhamLine(prev, cur);
      let point = line.increment();
      while (point !== true) {
        trail.push(this.game.ref(point.x, point.y));
        point = line.increment();
      }
      newTrailSize = line.size();
    } else {
      trail.push(unit.lastTile());
    }

    this.drawTrail(
      trail.slice(-newTrailSize),
      this.theme.territoryColor(unit.owner()),
      rel,
    );
    this.drawSprite(unit);
  }

  private handleMIRVWarhead(unit: UnitView) {
    const rel = this.relationship(unit);

    this.clearCell(this.game.x(unit.lastTile()), this.game.y(unit.lastTile()));

    if (unit.isActive()) {
      // Paint area
      this.paintCell(
        this.game.x(unit.tile()),
        this.game.y(unit.tile()),
        rel,
        this.theme.borderColor(unit.owner()),
        255,
      );
    }
  }

  private handleTradeShipEvent(unit: UnitView) {
    this.drawSprite(unit);
  }

  private handleBoatEvent(unit: UnitView) {
    // Only draw the sprite, no trail operations at all
    this.drawSprite(unit);
  }

  paintCell(
    x: number,
    y: number,
    relationship: Relationship,
    color: Colord,
    alpha: number,
    context: CanvasRenderingContext2D = this.context,
  ) {
    this.clearCell(x, y, context);
    if (this.alternateView) {
      switch (relationship) {
        case Relationship.Self:
          context.fillStyle = this.theme.selfColor().toRgbString();
          break;
        case Relationship.Ally:
          context.fillStyle = this.theme.allyColor().toRgbString();
          break;
        case Relationship.Enemy:
          context.fillStyle = this.theme.enemyColor().toRgbString();
          break;
      }
    } else {
      context.fillStyle = color.alpha(alpha / 255).toRgbString();
    }
    context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  clearCell(
    x: number,
    y: number,
    context: CanvasRenderingContext2D = this.context,
  ) {
    context.clearRect(Math.round(x), Math.round(y), 1, 1);
  }

  drawSprite(unit: UnitView, customTerritoryColor?: Colord) {
    const x = this.game.x(unit.tile());
    const y = this.game.y(unit.tile());

    let alternateViewColor: Colord | null = null;

    if (this.alternateView) {
      let rel = this.relationship(unit);
      const dstPortId = unit.targetUnitId();
      if (unit.type() === UnitType.TradeShip && dstPortId !== undefined) {
        const target = this.game.unit(dstPortId)?.owner();
        const myPlayer = this.game.myPlayer();
        if (myPlayer !== null && target !== undefined) {
          if (myPlayer === target) {
            rel = Relationship.Self;
          } else if (myPlayer.isFriendly(target)) {
            rel = Relationship.Ally;
          }
        }
      }
      switch (rel) {
        case Relationship.Self:
          alternateViewColor = this.theme.selfColor();
          break;
        case Relationship.Ally:
          alternateViewColor = this.theme.allyColor();
          break;
        case Relationship.Enemy:
          alternateViewColor = this.theme.enemyColor();
          break;
      }
    }

    const sprite = getColoredSprite(
      unit,
      this.theme,
      alternateViewColor ?? customTerritoryColor,
      alternateViewColor ?? undefined,
    );

    if (unit.isActive()) {
      this.context.save();
      this.context.translate(x, y);

      if (
        unit.type() === UnitType.TransportShip ||
        unit.type() === UnitType.Viper ||
        unit.type() === UnitType.Condor
      ) {
        const lastTile = unit.lastTile();
        const currentTile = unit.tile();
        if (lastTile && currentTile) {
          const dxPos = this.game.x(currentTile) - this.game.x(lastTile);
          const dyPos = this.game.y(currentTile) - this.game.y(lastTile);
          if (dxPos !== 0 || dyPos !== 0) {
            const angle = Math.atan2(dyPos, dxPos) - Math.PI / 2 + Math.PI;
            this.context.rotate(angle);
          }
        }
      }

      this.context.drawImage(
        sprite,
        -Math.floor(sprite.width / 2),
        -Math.floor(sprite.height / 2),
        sprite.width,
        sprite.height,
      );

      this.context.restore();
    }
  }

  /**
   * Draw a simple arrow marker at the move target position with discrete bobbing
   */
  private drawMoveMarker() {
    if (!this.moveMarkerTarget || this.moveMarkerTimer <= 0) return;

    const x = this.game.x(this.moveMarkerTarget);
    const y = this.game.y(this.moveMarkerTarget);

    // Use neon green color for the movement marker
    if (!this.myPlayer) return;
    const color = colord({ r: 57, g: 255, b: 20 });

    // Clear the previous marker position if it exists
    if (this.lastMarkerX !== null && this.lastMarkerY !== null) {
      this.context.clearRect(
        this.lastMarkerX - 7,
        this.lastMarkerY - 7,
        14,
        14
      );
    }

    // Use discrete positions for bobbing (4 frames)
    const bobOffsets = [0, -2, 0, 2]; // Base, up, base, down
    const bobIndex = Math.floor((12 - this.moveMarkerTimer) / 3) % 4;
    const bobOffset = bobOffsets[bobIndex];

    // Calculate and store the current position
    const currentY = y + bobOffset;
    this.lastMarkerX = x;
    this.lastMarkerY = currentY;

    // Simple opacity (no fade for 0.2 second duration)
    const opacity = 0.6;

    this.context.save();
    this.context.translate(x, currentY);

    // Set color with transparency
    this.context.fillStyle = color.alpha(opacity).toRgbString();

    // Draw a simple upward-pointing triangle (arrow)
    const size = 10;
    this.context.beginPath();
    this.context.moveTo(0, size / 2);            // Bottom point
    this.context.lineTo(-size / 2, -size / 2);   // Top left
    this.context.lineTo(size / 2, -size / 2);    // Top right
    this.context.closePath();
    this.context.fill();

    this.context.restore();
  }

  private drawTrail(trail: TileRef[], color: Colord, rel: Relationship) {
    // Paint new trail
    for (const t of trail) {
      this.paintCell(
        this.game.x(t),
        this.game.y(t),
        rel,
        color,
        150,
        this.unitTrailContext,
      );
    }
  }

  private clearTrail(unit: UnitView) {
    const trail = this.unitToTrail.get(unit) ?? [];
    const rel = this.relationship(unit);
    for (const t of trail) {
      this.clearCell(this.game.x(t), this.game.y(t), this.unitTrailContext);
    }
    this.unitToTrail.delete(unit);

    // Repaint overlapping trails
    const trailSet = new Set(trail);
    for (const [other, trail] of this.unitToTrail) {
      for (const t of trail) {
        if (trailSet.has(t)) {
          this.paintCell(
            this.game.x(t),
            this.game.y(t),
            rel,
            this.theme.territoryColor(other.owner()),
            150,
            this.unitTrailContext,
          );
        }
      }
    }
  }

  private updateExplosions() {
    // Update and render explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];

      // Render the explosion (this now handles clearing and redrawing units)
      this.renderExplosion(explosion);

      // Increment frame
      explosion.frame++;

      // Remove completed explosions
      if (explosion.frame >= explosion.maxFrames) {
        // Final cleanup - redraw any units one last time
        const clearRadius = this.getExplosionRadius(explosion.unitType);
        const nearbyUnits = [
          ...this.game.units(UnitType.Viper),
          ...this.game.units(UnitType.Condor),
          ...this.game.units(UnitType.SAMMissile),
        ].filter((u) => {
          if (!u.isActive()) return false;
          const unitX = this.game.x(u.tile());
          const unitY = this.game.y(u.tile());
          const dx = Math.abs(unitX - explosion.x);
          const dy = Math.abs(unitY - explosion.y);
          return dx <= clearRadius && dy <= clearRadius;
        });

        // Clear the area one final time
        this.context.clearRect(
          explosion.x - clearRadius,
          explosion.y - clearRadius,
          clearRadius * 2,
          clearRadius * 2,
        );

        // Redraw units
        nearbyUnits.forEach((u) => {
          if (
            (u.type() === UnitType.Viper || u.type() === UnitType.Condor) &&
            u.targetUnitId()
          ) {
            this.drawSprite(u, colord({ r: 200, b: 0, g: 0 }));
          } else {
            this.drawSprite(u);
          }
        });

        this.explosions.splice(i, 1);
      }
    }
  }

  private getExplosionRadius(unitType: UnitType): number {
    // Condor explosions are twice the size of Viper explosions
    if (unitType === UnitType.Condor) {
      return 20;
    }
    // Nuclear explosions need much larger cleanup radius due to tall mushroom clouds
    if (unitType === UnitType.AtomBomb) {
      return 35; // Covers mushroom cloud that extends to -30px
    }
    if (unitType === UnitType.HydrogenBomb) {
      return 150; // Covers massive 3x larger mushroom cloud that extends to -138px
    }
    // Viper explosions are the base size
    return 10;
  }

  private renderExplosion(explosion: Explosion) {
    const progress = explosion.frame / explosion.maxFrames;

    // Clear the area where we'll draw the explosion
    const clearRadius = this.getExplosionRadius(explosion.unitType);
    this.context.clearRect(
      explosion.x - clearRadius,
      explosion.y - clearRadius,
      clearRadius * 2,
      clearRadius * 2,
    );

    // Redraw any units that might be in the explosion area
    const unitsInExplosionArea = [
      ...this.game.units(UnitType.Viper),
      ...this.game.units(UnitType.Condor),
      ...this.game.units(UnitType.SAMMissile),
    ].filter((u) => {
      if (!u.isActive()) return false;
      const unitX = this.game.x(u.tile());
      const unitY = this.game.y(u.tile());
      const dx = Math.abs(unitX - explosion.x);
      const dy = Math.abs(unitY - explosion.y);
      return dx <= clearRadius && dy <= clearRadius;
    });

    // Sort and redraw units
    unitsInExplosionArea.sort((a, b) => {
      if (a.tile() !== b.tile()) {
        return a.tile() - b.tile();
      }
      return a.id() - b.id();
    });

    unitsInExplosionArea.forEach((u) => {
      if (
        (u.type() === UnitType.Viper || u.type() === UnitType.Condor) &&
        u.targetUnitId()
      ) {
        this.drawSprite(u, colord({ r: 200, b: 0, g: 0 }));
      } else {
        this.drawSprite(u);
      }
    });

    // Draw retro explosion based on pattern
    this.drawRetroExplosionPattern(explosion, progress);
  }

  private drawRetroExplosionPattern(explosion: Explosion, progress: number) {
    const x = explosion.x;
    const y = explosion.y;
    const frame = explosion.frame;

    // Colors for retro feel
    const white = colord({ r: 255, g: 255, b: 255 });
    const yellow = colord({ r: 255, g: 255, b: 0 });
    const orange = colord({ r: 255, g: 165, b: 0 });
    const red = colord({ r: 255, g: 0, b: 0 });
    const color = explosion.color;

    // Opacity fades out
    const opacity = 1 - progress * 0.7;

    if (explosion.unitType === UnitType.Viper) {
      this.drawViperExplosion(
        x,
        y,
        frame,
        white.alpha(opacity),
        color.alpha(opacity * 0.8),
      );
    } else if (explosion.unitType === UnitType.Condor) {
      this.drawCondorExplosion(
        x,
        y,
        frame,
        yellow.alpha(opacity),
        color.alpha(opacity * 0.8),
      );
    } else if (explosion.unitType === UnitType.AtomBomb) {
      this.drawAtomBombExplosion(
        x,
        y,
        frame,
        orange.alpha(opacity),
        red.alpha(opacity * 0.8),
      );
    } else if (explosion.unitType === UnitType.HydrogenBomb) {
      this.drawHydrogenBombExplosion(
        x,
        y,
        frame,
        orange.alpha(opacity),
        red.alpha(opacity * 0.8),
      );
    }
  }

  // Viper explosion - smaller, pixelated burst
  private drawViperExplosion(
    x: number,
    y: number,
    frame: number,
    c1: Colord,
    c2: Colord,
  ) {
    // Jumpy animation - only change on every other frame
    const jumpyFrame = Math.floor(frame / 2);

    if (jumpyFrame === 0) {
      // Frame 0-1: Small center flash
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 2, y - 2, 4, 4);
    } else if (jumpyFrame === 1) {
      // Frame 2-3: Cross pattern
      this.context.fillStyle = c2.toRgbString();
      // Center
      this.context.fillRect(x - 1, y - 1, 2, 2);
      // Cross arms
      this.context.fillRect(x - 4, y, 2, 2);
      this.context.fillRect(x + 3, y, 2, 2);
      this.context.fillRect(x, y - 4, 2, 2);
      this.context.fillRect(x, y + 3, 2, 2);
    } else if (jumpyFrame === 2) {
      // Frame 4-5: Scattered pixels
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 6, y - 2, 1, 1);
      this.context.fillRect(x + 6, y + 1, 1, 1);
      this.context.fillRect(x - 2, y - 6, 1, 1);
      this.context.fillRect(x + 1, y + 6, 1, 1);
      this.context.fillRect(x - 4, y - 4, 1, 1);
      this.context.fillRect(x + 4, y + 4, 1, 1);
      this.context.fillRect(x + 4, y - 4, 1, 1);
      this.context.fillRect(x - 4, y + 4, 1, 1);
    } else {
      // Frame 6-7: Final scattered dots
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 7, y, 1, 1);
      this.context.fillRect(x + 7, y, 1, 1);
      this.context.fillRect(x, y - 7, 1, 1);
      this.context.fillRect(x, y + 7, 1, 1);
    }
  }

  // Condor explosion - twice the size of Viper
  private drawCondorExplosion(
    x: number,
    y: number,
    frame: number,
    c1: Colord,
    c2: Colord,
  ) {
    // Jumpy animation - only change on every other frame
    const jumpyFrame = Math.floor(frame / 2);

    if (jumpyFrame === 0) {
      // Frame 0-1: Large center flash
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 4, y - 4, 8, 8);
    } else if (jumpyFrame === 1) {
      // Frame 2-3: Large cross pattern
      this.context.fillStyle = c2.toRgbString();
      // Center
      this.context.fillRect(x - 2, y - 2, 4, 4);
      // Cross arms (double the Viper size)
      this.context.fillRect(x - 8, y - 1, 4, 3);
      this.context.fillRect(x + 5, y - 1, 4, 3);
      this.context.fillRect(x - 1, y - 8, 3, 4);
      this.context.fillRect(x - 1, y + 5, 3, 4);

      // Additional corner pixels
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 6, y - 6, 2, 2);
      this.context.fillRect(x + 5, y - 6, 2, 2);
      this.context.fillRect(x - 6, y + 5, 2, 2);
      this.context.fillRect(x + 5, y + 5, 2, 2);
    } else if (jumpyFrame === 2) {
      // Frame 4-5: Large scattered burst
      this.context.fillStyle = c2.toRgbString();
      // Inner ring
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const px = Math.round(x + Math.cos(angle) * 8);
        const py = Math.round(y + Math.sin(angle) * 8);
        this.context.fillRect(px - 1, py - 1, 2, 2);
      }
      // Outer scattered pixels
      this.context.fillRect(x - 12, y - 4, 2, 2);
      this.context.fillRect(x + 11, y + 3, 2, 2);
      this.context.fillRect(x - 4, y - 12, 2, 2);
      this.context.fillRect(x + 3, y + 11, 2, 2);
    } else {
      // Frame 6-7: Final large scattered dots
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 14, y - 2, 1, 1);
      this.context.fillRect(x + 14, y + 2, 1, 1);
      this.context.fillRect(x - 2, y - 14, 1, 1);
      this.context.fillRect(x + 2, y + 14, 1, 1);
      this.context.fillRect(x - 10, y - 10, 1, 1);
      this.context.fillRect(x + 10, y + 10, 1, 1);
      this.context.fillRect(x + 10, y - 10, 1, 1);
      this.context.fillRect(x - 10, y + 10, 1, 1);
    }
  }

  // Atom Bomb explosion - pixelated mushroom cloud pattern
  private drawAtomBombExplosion(
    x: number,
    y: number,
    frame: number,
    c1: Colord,
    c2: Colord,
  ) {
    // Jumpy animation - only change on every other frame for retro feel
    const jumpyFrame = Math.floor(frame / 2);

    if (jumpyFrame === 0) {
      // Frame 0-1: Initial flash at ground level
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 4, y - 2, 8, 4);
    } else if (jumpyFrame === 1) {
      // Frame 2-3: Stem begins to form
      this.context.fillStyle = c2.toRgbString();
      // Stem
      this.context.fillRect(x - 2, y - 8, 4, 10);
      // Ground blast
      this.context.fillRect(x - 6, y - 1, 12, 3);
    } else if (jumpyFrame === 2) {
      // Frame 4-5: Mushroom cap starts forming
      this.context.fillStyle = c2.toRgbString();
      // Stem
      this.context.fillRect(x - 2, y - 12, 4, 14);
      // Cap starts
      this.context.fillRect(x - 6, y - 16, 12, 4);
      // Ground blast spreads
      this.context.fillRect(x - 8, y - 1, 16, 3);
    } else if (jumpyFrame === 3) {
      // Frame 6-7: Full mushroom cloud
      this.context.fillStyle = c2.toRgbString();
      // Stem
      this.context.fillRect(x - 3, y - 14, 6, 16);
      // Large mushroom cap
      this.context.fillRect(x - 10, y - 20, 20, 6);
      // Cap details
      this.context.fillRect(x - 8, y - 22, 16, 2);
      this.context.fillRect(x - 6, y - 24, 12, 2);
      // Ground blast
      this.context.fillRect(x - 10, y - 1, 20, 3);
    } else if (jumpyFrame === 4) {
      // Frame 8-9: Mushroom cloud expands
      this.context.fillStyle = c2.toRgbString();
      // Thick stem
      this.context.fillRect(x - 4, y - 16, 8, 18);
      // Massive cap
      this.context.fillRect(x - 14, y - 24, 28, 8);
      // Cap top details
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 12, y - 26, 24, 2);
      this.context.fillRect(x - 10, y - 28, 20, 2);
      this.context.fillRect(x - 6, y - 30, 12, 2);
      // Ground spread
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 12, y - 1, 24, 3);
    } else {
      // Frame 10-11: Mushroom cloud disperses
      this.context.fillStyle = c2.alpha(0.7).toRgbString();
      // Fading stem
      this.context.fillRect(x - 3, y - 14, 6, 16);
      // Dispersing cap
      this.context.fillRect(x - 12, y - 22, 24, 6);
      // Scattered cloud particles
      this.context.fillRect(x - 16, y - 26, 4, 2);
      this.context.fillRect(x + 13, y - 26, 4, 2);
      this.context.fillRect(x - 8, y - 30, 3, 2);
      this.context.fillRect(x + 6, y - 30, 3, 2);
      // Fading ground effects
      this.context.fillRect(x - 10, y - 1, 20, 2);
    }
  }

  // Hydrogen Bomb explosion - massive pixelated mushroom cloud (3x larger, atom bomb colors)
  private drawHydrogenBombExplosion(
    x: number,
    y: number,
    frame: number,
    c1: Colord,
    c2: Colord,
  ) {
    // Jumpy animation - only change on every other frame for retro feel
    const jumpyFrame = Math.floor(frame / 2);

    if (jumpyFrame === 0) {
      // Frame 0-1: Massive initial flash (3x larger)
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 18, y - 9, 36, 18);
    } else if (jumpyFrame === 1) {
      // Frame 2-3: Large stem begins (3x larger)
      this.context.fillStyle = c2.toRgbString();
      // Thick stem
      this.context.fillRect(x - 9, y - 36, 18, 45);
      // Wide ground blast
      this.context.fillRect(x - 30, y - 6, 60, 12);
    } else if (jumpyFrame === 2) {
      // Frame 4-5: Massive mushroom cap forming (3x larger)
      this.context.fillStyle = c2.toRgbString();
      // Stem
      this.context.fillRect(x - 12, y - 54, 24, 60);
      // Cap base
      this.context.fillRect(x - 36, y - 72, 72, 18);
      // Ground blast spreads
      this.context.fillRect(x - 42, y - 6, 84, 12);
    } else if (jumpyFrame === 3) {
      // Frame 6-7: Enormous mushroom cloud (3x larger)
      this.context.fillStyle = c2.toRgbString();
      // Massive stem
      this.context.fillRect(x - 15, y - 60, 30, 66);
      // Huge mushroom cap
      this.context.fillRect(x - 54, y - 90, 108, 30);
      // Cap details with bright center
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 48, y - 96, 96, 6);
      this.context.fillRect(x - 36, y - 102, 72, 6);
      this.context.fillRect(x - 24, y - 108, 48, 6);
      // Ground devastation
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 48, y - 6, 96, 12);
    } else if (jumpyFrame === 4) {
      // Frame 8-9: Peak mushroom cloud (3x larger)
      this.context.fillStyle = c2.toRgbString();
      // Enormous stem
      this.context.fillRect(x - 18, y - 72, 36, 78);
      // Colossal cap
      this.context.fillRect(x - 66, y - 108, 132, 36);
      // Multi-layered cap details
      this.context.fillStyle = c1.toRgbString();
      this.context.fillRect(x - 60, y - 114, 120, 6);
      this.context.fillRect(x - 48, y - 120, 96, 6);
      this.context.fillRect(x - 36, y - 126, 72, 6);
      this.context.fillRect(x - 18, y - 132, 36, 6);
      // Massive ground effects
      this.context.fillStyle = c2.toRgbString();
      this.context.fillRect(x - 60, y - 6, 120, 12);
    } else {
      // Frame 10-11: Mushroom cloud disperses (3x larger)
      this.context.fillStyle = c2.alpha(0.6).toRgbString();
      // Fading massive stem
      this.context.fillRect(x - 15, y - 66, 30, 72);
      // Dispersing enormous cap
      this.context.fillRect(x - 60, y - 102, 120, 30);
      // Scattered cloud particles across wide area
      this.context.fillRect(x - 78, y - 114, 18, 9);
      this.context.fillRect(x + 63, y - 114, 18, 9);
      this.context.fillRect(x - 54, y - 126, 12, 6);
      this.context.fillRect(x + 45, y - 126, 12, 6);
      this.context.fillRect(x - 30, y - 138, 12, 6);
      this.context.fillRect(x + 21, y - 138, 12, 6);
      // Lingering ground devastation
      this.context.fillRect(x - 54, y - 6, 108, 9);
    }
  }
}
