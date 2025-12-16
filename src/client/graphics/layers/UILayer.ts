import { Colord, colord } from "colord";
import { EventBus } from "../../../core/EventBus";
import { ClientID } from "../../../core/Schemas";
import { Theme } from "../../../core/configuration/Config";
import { UnitType } from "../../../core/game/Game";
import { GameView, UnitView } from "../../../core/game/GameView";
import { UnitSelectionEvent } from "../../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";
import { MultiUnitSelectionEvent } from "./UnitLayer";

/**
 * Layer responsible for drawing UI elements that overlay the game
 * such as selection boxes, health bars, etc.
 */
export class UILayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D | null;

  private theme: Theme | null = null;
  private selectionAnimTime = 0;

  // Keep track of currently selected unit
  private selectedUnit: UnitView | null = null;
  private selectedUnits: Set<UnitView> = new Set();

  // Keep track of previous selection box positions for cleanup (unit ID -> position)
  private lastSelectionBoxCenters: Map<number, {
    x: number;
    y: number;
    size: number;
  }> = new Map();

  // Visual settings for selection
  private readonly SELECTION_BOX_SIZE = 6; // Size of the selection box (should be larger than the warship)

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private clientID: ClientID,
    private transformHandler: TransformHandler,
  ) {
    this.theme = game.config().theme();
  }

  shouldTransform(): boolean {
    return true;
  }

  tick() {
    // Update the selection animation time
    this.selectionAnimTime = (this.selectionAnimTime + 1) % 60;

    // Draw selection box for single selected unit
    if (
      this.selectedUnit &&
      (this.selectedUnit.type() === UnitType.Viper ||
        this.selectedUnit.type() === UnitType.Condor)
    ) {
      this.drawSelectionBox(this.selectedUnit);
    }

    // Draw selection boxes for all multi-selected units
    for (const unit of this.selectedUnits) {
      if (unit.type() === UnitType.Viper || unit.type() === UnitType.Condor) {
        this.drawSelectionBox(unit);
      }
    }
  }

  init() {
    this.eventBus.on(UnitSelectionEvent, (e) => this.onUnitSelection(e));
    this.eventBus.on(MultiUnitSelectionEvent, (e) => this.onMultiUnitSelection(e));
    this.redraw();
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

  redraw() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d");

    this.canvas.width = this.game.width();
    this.canvas.height = this.game.height();
  }

  /**
   * Handle the unit selection event
   */
  private onUnitSelection(event: UnitSelectionEvent) {
    if (event.isSelected) {
      this.selectedUnit = event.unit;
      if (
        event.unit &&
        (event.unit.type() === UnitType.Viper ||
          event.unit.type() === UnitType.Condor)
      ) {
        this.drawSelectionBox(event.unit);
      }
    } else {
      if (this.selectedUnit === event.unit && event.unit) {
        // Clear the selection box for this specific unit
        const unitId = event.unit.id();
        const lastPosition = this.lastSelectionBoxCenters.get(unitId);
        if (lastPosition) {
          const { x, y, size } = lastPosition;
          this.clearSelectionBox(x, y, size);
          this.lastSelectionBoxCenters.delete(unitId);
        }
        this.selectedUnit = null;
      }
    }
  }

  /**
   * Handle the multi-unit selection event
   */
  private onMultiUnitSelection(event: MultiUnitSelectionEvent) {
    // Clear selection boxes for units that are no longer selected
    for (const [unitId, position] of this.lastSelectionBoxCenters) {
      // Check if this unit is still selected
      let unitStillSelected = false;
      for (const unit of event.units) {
        if (unit.id() === unitId) {
          unitStillSelected = true;
          break;
        }
      }

      // If not selected anymore, clear its box
      if (!unitStillSelected) {
        this.clearSelectionBox(position.x, position.y, position.size);
        this.lastSelectionBoxCenters.delete(unitId);
      }
    }

    // Update the selected units set
    this.selectedUnits.clear();
    for (const unit of event.units) {
      this.selectedUnits.add(unit);
    }

    // Clear canvas and redraw if we have selections
    this.redraw();
  }

  /**
   * Clear the selection box at a specific position
   */
  private clearSelectionBox(x: number, y: number, size: number) {
    for (let px = x - size; px <= x + size; px++) {
      for (let py = y - size; py <= y + size; py++) {
        if (
          px === x - size ||
          px === x + size ||
          py === y - size ||
          py === y + size
        ) {
          this.clearCell(px, py);
        }
      }
    }
  }

  /**
   * Draw a selection box around the given unit
   */
  public drawSelectionBox(unit: UnitView) {
    if (!unit || !unit.isActive()) {
      return;
    }

    const unitId = unit.id();

    // Use the configured selection box size
    const selectionSize = this.SELECTION_BOX_SIZE;

    // Calculate pulsating effect based on animation time (25% variation in opacity)
    const baseOpacity = 200;
    const pulseAmount = 55;
    const opacity =
      baseOpacity + Math.sin(this.selectionAnimTime * 0.1) * pulseAmount;

    // Use neon green for the selection box
    if (this.theme === null) throw new Error("missing theme");

    // Use neon green color for the selection
    const selectionColor = colord({ r: 57, g: 255, b: 20 });

    // Get current center position
    const center = unit.tile();
    const centerX = this.game.x(center);
    const centerY = this.game.y(center);

    // Get the last position for this specific unit
    const lastPosition = this.lastSelectionBoxCenters.get(unitId);

    // Clear previous selection box if it exists and is different from current position
    if (
      lastPosition &&
      (lastPosition.x !== centerX ||
        lastPosition.y !== centerY)
    ) {
      // Clear the previous selection box for this unit
      this.clearSelectionBox(lastPosition.x, lastPosition.y, lastPosition.size);
    }

    // Draw the selection box
    for (let x = centerX - selectionSize; x <= centerX + selectionSize; x++) {
      for (let y = centerY - selectionSize; y <= centerY + selectionSize; y++) {
        // Only draw if it's on the border (not inside or outside the box)
        if (
          x === centerX - selectionSize ||
          x === centerX + selectionSize ||
          y === centerY - selectionSize ||
          y === centerY + selectionSize
        ) {
          // Create a dashed effect by only drawing some pixels
          const dashPattern = (x + y) % 2 === 0;
          if (dashPattern) {
            this.paintCell(x, y, selectionColor, opacity);
          }
        }
      }
    }

    // Store current selection box position for this unit for next cleanup
    this.lastSelectionBoxCenters.set(unitId, {
      x: centerX,
      y: centerY,
      size: selectionSize,
    });
  }

  /**
   * Draw health bar for a unit (placeholder for future implementation)
   */
  public drawHealthBar(unit: UnitView) {
    // This is a placeholder for future health bar implementation
    // It would draw a health bar above units that have health
  }

  paintCell(x: number, y: number, color: Colord, alpha: number) {
    if (this.context === null) throw new Error("null context");
    this.clearCell(x, y);
    this.context.fillStyle = color.alpha(alpha / 255).toRgbString();
    this.context.fillRect(x, y, 1, 1);
  }

  clearCell(x: number, y: number) {
    if (this.context === null) throw new Error("null context");
    this.context.clearRect(x, y, 1, 1);
  }
}
