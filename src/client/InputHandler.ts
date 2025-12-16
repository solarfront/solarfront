import { EventBus, GameEvent } from "../core/EventBus";
import { Cell, UnitType } from "../core/game/Game";
import { UnitView } from "../core/game/GameView";
import { UserSettings } from "../core/game/UserSettings";
import { MultiSelectModeEvent } from "./graphics/layers/MultiSelectButton";
import { MultiUnitSelectionEvent } from "./graphics/layers/UnitLayer";
import { TransformHandler } from "./graphics/TransformHandler";

export class MouseUpEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

/**
 * Event emitted when a unit is selected or deselected
 */
export class UnitSelectionEvent implements GameEvent {
  constructor(
    public readonly unit: UnitView | null,
    public readonly isSelected: boolean,
  ) {}
}

export class MouseDownEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class MouseMoveEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class ContextMenuEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class ZoomEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly delta: number,
  ) {}
}

export class DragEvent implements GameEvent {
  constructor(
    public readonly deltaX: number,
    public readonly deltaY: number,
  ) {}
}

export class AlternateViewEvent implements GameEvent {
  constructor(public readonly alternateView: boolean) {}
}

export class CloseViewEvent implements GameEvent {}

export class RefreshGraphicsEvent implements GameEvent {}

export class ShowBuildMenuEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}
export class ShowEmojiMenuEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class AttackRatioEvent implements GameEvent {
  constructor(public readonly attackRatio: number) {}
}

export class CenterCameraEvent implements GameEvent {
  constructor() {}
}

export class ToggleChatEvent implements GameEvent {
  constructor() {}
}

export class HotkeyUnitEvent implements GameEvent {
  constructor(
    public readonly unitType: UnitType,
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class HotkeyTransportShipEvent implements GameEvent {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class SelectionBoxStartEvent implements GameEvent {
  constructor(
    public readonly startCell: Cell,
    public readonly screenX: number,
    public readonly screenY: number,
  ) {}
}

export class SelectionBoxUpdateEvent implements GameEvent {
  constructor(
    public readonly startCell: Cell,
    public readonly endCell: Cell,
    public readonly screenStartX: number,
    public readonly screenStartY: number,
    public readonly screenEndX: number,
    public readonly screenEndY: number,
  ) {}
}

export class SelectionBoxEndEvent implements GameEvent {
  constructor(
    public readonly startCell: Cell,
    public readonly endCell: Cell,
  ) {}
}

export class BuildingDropEvent implements GameEvent {
  constructor(
    public readonly unitType: UnitType,
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class InputHandler {
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  private lastPointerDownX: number = 0;
  private lastPointerDownY: number = 0;

  private pointers: Map<number, PointerEvent> = new Map();

  private lastPinchDistance: number = 0;

  private pointerDown: boolean = false;

  private alternateView = false;

  private moveInterval: NodeJS.Timeout | null = null;
  private activeKeys = new Set<string>();

  // Track current mouse position for hotkeys
  private currentMouseX: number = 0;
  private currentMouseY: number = 0;

  private readonly PAN_SPEED = 5;
  private readonly ZOOM_SPEED = 10;

  private userSettings: UserSettings = new UserSettings();

  // Track if already initialized to prevent duplicate event listeners
  private initialized: boolean = false;

  // Track last hotkey press time to prevent double-firing
  private lastHotkeyTime: Map<string, number> = new Map();
  private readonly HOTKEY_DEBOUNCE_TIME = 10; // 10ms debounce - minimal protection against keyboard bounce while allowing maximum mashing speed

  // Multi-select mode tracking
  private multiSelectMode = false;
  private isSelectionDragging = false;
  private selectionStartX = 0;
  private selectionStartY = 0;
  private selectionStartCell: Cell | null = null;
  private hasSelectedUnits = false; // Track if units are currently selected

  constructor(
    private canvas: HTMLCanvasElement,
    private eventBus: EventBus,
    private transformHandler?: TransformHandler,
  ) {}

  private isHotkeyDebounced(code: string): boolean {
    const now = Date.now();
    const lastTime = this.lastHotkeyTime.get(code) || 0;
    
    if (now - lastTime < this.HOTKEY_DEBOUNCE_TIME) {
      console.log(`Hotkey ${code} debounced (${now - lastTime}ms since last press), ignoring`);
      return false;
    }
    
    console.log(`Hotkey ${code} pressed (${now - lastTime}ms since last press)`);
    this.lastHotkeyTime.set(code, now);
    return true;
  }

  setTransformHandler(transformHandler: TransformHandler) {
    this.transformHandler = transformHandler;
  }

  initialize() {
    // Prevent duplicate initialization
    if (this.initialized) {
      console.warn("InputHandler already initialized, skipping...");
      return;
    }
    this.initialized = true;
    const keybinds = {
      toggleView: "Space",
      centerCamera: "KeyC",
      moveUp: "KeyW",
      moveDown: "KeyS",
      moveLeft: "KeyA",
      moveRight: "KeyD",
      zoomOut: "KeyQ",
      zoomIn: "KeyE",
      ...JSON.parse(localStorage.getItem("settings.keybinds") ?? "{}"),
    };

    // Listen for multi-select mode changes
    this.eventBus.on(MultiSelectModeEvent, (event) => {
      this.multiSelectMode = event.enabled;
      if (!event.enabled && this.isSelectionDragging) {
        // Cancel any ongoing selection
        this.isSelectionDragging = false;
      }
    });

    // Listen for multi-unit selection changes to track if units are selected
    this.eventBus.on(MultiUnitSelectionEvent, (event) => {
      this.hasSelectedUnits = event.units.size > 0;
    });

    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        this.onScroll(e);
        this.onShiftScroll(e);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener("pointermove", this.onPointerMove.bind(this));
    this.canvas.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    
    // Add drag and drop event listeners for building placement
    this.canvas.addEventListener("dragover", (e) => {
      e.preventDefault(); // Allow drop
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    });
    
    this.canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      
      const unitTypeString = e.dataTransfer.getData("unitType");
      if (unitTypeString && Object.values(UnitType).includes(unitTypeString as UnitType)) {
        const unitType = unitTypeString as UnitType;
        console.log(`Drop detected: ${unitType} at screen coordinates ${e.clientX},${e.clientY}`);
        this.eventBus.emit(new BuildingDropEvent(unitType, e.clientX, e.clientY));
      }
    });
    
    window.addEventListener("mousemove", (e) => {
      // Update current mouse position for hotkeys
      this.currentMouseX = e.clientX;
      this.currentMouseY = e.clientY;

      if (e.movementX || e.movementY) {
        this.eventBus.emit(new MouseMoveEvent(e.clientX, e.clientY));
      }
    });
    this.pointers.clear();

    this.moveInterval = setInterval(() => {
      let deltaX = 0;
      let deltaY = 0;

      if (
        this.activeKeys.has(keybinds.moveUp) ||
        this.activeKeys.has("ArrowUp")
      )
        deltaY += this.PAN_SPEED;
      if (
        this.activeKeys.has(keybinds.moveDown) ||
        this.activeKeys.has("ArrowDown")
      )
        deltaY -= this.PAN_SPEED;
      if (
        this.activeKeys.has(keybinds.moveLeft) ||
        this.activeKeys.has("ArrowLeft")
      )
        deltaX += this.PAN_SPEED;
      if (
        this.activeKeys.has(keybinds.moveRight) ||
        this.activeKeys.has("ArrowRight")
      )
        deltaX -= this.PAN_SPEED;

      if (deltaX || deltaY) {
        this.eventBus.emit(new DragEvent(deltaX, deltaY));
      }

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;

      if (
        this.activeKeys.has(keybinds.zoomOut) ||
        this.activeKeys.has("Minus")
      ) {
        this.eventBus.emit(new ZoomEvent(cx, cy, this.ZOOM_SPEED));
      }
      if (
        this.activeKeys.has(keybinds.zoomIn) ||
        this.activeKeys.has("Equal")
      ) {
        this.eventBus.emit(new ZoomEvent(cx, cy, -this.ZOOM_SPEED));
      }
    }, 1);

    window.addEventListener("keydown", (e) => {
      if (e.code === "Enter") {
        e.preventDefault();
        this.eventBus.emit(new ToggleChatEvent());
        return;
      }
      if (e.code === keybinds.toggleView) {
        e.preventDefault();
        if (!this.alternateView) {
          this.alternateView = true;
          this.eventBus.emit(new AlternateViewEvent(true));
        }
      }

      if (e.code === "Escape") {
        e.preventDefault();
        this.eventBus.emit(new CloseViewEvent());
      }

      if (
        [
          keybinds.moveUp,
          keybinds.moveDown,
          keybinds.moveLeft,
          keybinds.moveRight,
          keybinds.zoomOut,
          keybinds.zoomIn,
          "ArrowUp",
          "ArrowLeft",
          "ArrowDown",
          "ArrowRight",
          "Minus",
          "Equal",
          "Digit4",
          "Digit5",
          "Digit6",
          "Digit7",
          keybinds.centerCamera,
          "ControlLeft",
          "ControlRight",
        ].includes(e.code)
      ) {
        this.activeKeys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === keybinds.toggleView) {
        e.preventDefault();
        this.alternateView = false;
        this.eventBus.emit(new AlternateViewEvent(false));
      }

      if (e.key.toLowerCase() === "r" && e.altKey && !e.ctrlKey) {
        e.preventDefault();
        this.eventBus.emit(new RefreshGraphicsEvent());
      }

      // Hotkey 1 - Colony
      if (e.code === "Digit1") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.City,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 2 - Space Port
      if (e.code === "Digit2") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.Port,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 3 - Defense Post
      if (e.code === "Digit3") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.DefensePost,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 4 - Missile Silo
      if (e.code === "Digit4") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.MissileSilo,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 5 - Atom Bomb
      if (e.code === "Digit5") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.AtomBomb,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 6 - Fusion Bomb
      if (e.code === "Digit6") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.HydrogenBomb,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 7 - Viper
      if (e.code === "Digit7") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.Viper,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 8 - Condor
      if (e.code === "Digit8") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.Condor,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 9 - Shield Cannon
      if (e.code === "Digit9") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.SAMLauncher,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey 0 - Orbital Cannon
      if (e.code === "Digit0") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyUnitEvent(
              UnitType.OrbitalCannon,
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      // Hotkey ~ - Transport Ship
      if (e.code === "Backquote") {
        e.preventDefault();
        if (this.isHotkeyDebounced(e.code)) {
          this.eventBus.emit(
            new HotkeyTransportShipEvent(
              this.currentMouseX,
              this.currentMouseY,
            ),
          );
        }
      }

      if (e.code === keybinds.centerCamera) {
        e.preventDefault();
        this.eventBus.emit(new CenterCameraEvent());
      }

      this.activeKeys.delete(e.code);
    });
  }

  private onPointerDown(event: PointerEvent) {
    if (event.button > 0) {
      return;
    }

    this.pointerDown = true;
    this.pointers.set(event.pointerId, event);

    if (this.pointers.size === 1) {
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      this.lastPointerDownX = event.clientX;
      this.lastPointerDownY = event.clientY;

      // Check if multi-select mode is active
      // Only start selection box if we don't have units selected
      // This allows clicking to move selected units
      if (this.multiSelectMode && !this.hasSelectedUnits) {
        this.isSelectionDragging = true;
        // Store screen coordinates for dragging
        this.selectionStartX = event.clientX;
        this.selectionStartY = event.clientY;

        // Convert to cell coordinates if transformHandler is available
        if (this.transformHandler) {
          this.selectionStartCell = this.transformHandler.screenToWorldCoordinates(
            event.clientX,
            event.clientY
          );
          this.eventBus.emit(new SelectionBoxStartEvent(
            this.selectionStartCell,
            event.clientX,
            event.clientY
          ));
        } else {
          console.warn("TransformHandler not available for cell conversion");
        }

        // Still trigger click animation in multi-select mode
        const cursorManager = (window as any).CursorManager?.getInstance();
        if (cursorManager && cursorManager.createClickRipple) {
          cursorManager.createClickRipple(event.clientX, event.clientY);
        }
      } else {
        // Either not in multi-select mode, or we have units selected (for movement)
        this.eventBus.emit(new MouseDownEvent(event.clientX, event.clientY));
      }
    } else if (this.pointers.size === 2) {
      this.lastPinchDistance = this.getPinchDistance();
    }
  }

  onPointerUp(event: PointerEvent) {
    if (event.button > 0) {
      return;
    }
    this.pointerDown = false;
    this.pointers.clear();

    // Handle selection box end
    if (this.multiSelectMode && this.isSelectionDragging) {
      this.isSelectionDragging = false;

      if (this.transformHandler && this.selectionStartCell) {
        const endCell = this.transformHandler.screenToWorldCoordinates(
          event.clientX,
          event.clientY
        );
        this.eventBus.emit(new SelectionBoxEndEvent(
          this.selectionStartCell,
          endCell
        ));
        this.selectionStartCell = null;
      } else {
        console.warn("Cannot end selection without transformHandler or start cell");
      }
      return;
    }

    if (event.ctrlKey) {
      this.eventBus.emit(new ShowBuildMenuEvent(event.clientX, event.clientY));
      return;
    }
    if (event.altKey) {
      this.eventBus.emit(new ShowEmojiMenuEvent(event.clientX, event.clientY));
      return;
    }

    const dist =
      Math.abs(event.x - this.lastPointerDownX) +
      Math.abs(event.y - this.lastPointerDownY);
    if (dist < 10) {
      if (event.pointerType === "touch") {
        this.eventBus.emit(new ContextMenuEvent(event.clientX, event.clientY));
        event.preventDefault();
        return;
      }

      // If units are selected, always emit MouseUpEvent for movement
      // Otherwise follow user settings for left click behavior
      if (this.hasSelectedUnits || !this.userSettings.leftClickOpensMenu() || event.shiftKey) {
        this.eventBus.emit(new MouseUpEvent(event.x, event.y));
      } else {
        this.eventBus.emit(new ContextMenuEvent(event.clientX, event.clientY));
      }
    }
  }

  private onScroll(event: WheelEvent) {
    if (!event.shiftKey) {
      const realCtrl =
        this.activeKeys.has("ControlLeft") ||
        this.activeKeys.has("ControlRight");
      const ratio = event.ctrlKey && !realCtrl ? 10 : 1; // Compensate pinch-zoom low sensitivity
      this.eventBus.emit(new ZoomEvent(event.x, event.y, event.deltaY * ratio));
    }
  }

  private onShiftScroll(event: WheelEvent) {
    if (event.shiftKey) {
      const ratio = event.deltaY > 0 ? -10 : 10;
      this.eventBus.emit(new AttackRatioEvent(ratio));
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (event.button > 0) {
      return;
    }

    this.pointers.set(event.pointerId, event);

    if (!this.pointerDown) {
      return;
    }

    if (this.pointers.size === 1) {
      // Check if we're dragging for selection
      if (this.multiSelectMode && this.isSelectionDragging) {
        if (this.transformHandler && this.selectionStartCell) {
          const currentCell = this.transformHandler.screenToWorldCoordinates(
            event.clientX,
            event.clientY
          );
          this.eventBus.emit(new SelectionBoxUpdateEvent(
            this.selectionStartCell,
            currentCell,
            this.selectionStartX,
            this.selectionStartY,
            event.clientX,
            event.clientY
          ));
        }
      } else if (this.multiSelectMode && this.hasSelectedUnits && !this.isSelectionDragging) {
        // We have units selected and started dragging - start a selection box now
        const dragDistance = Math.abs(event.clientX - this.lastPointerDownX) +
                           Math.abs(event.clientY - this.lastPointerDownY);
        if (dragDistance > 10) {  // Only start selection after dragging 10+ pixels
          this.isSelectionDragging = true;
          this.selectionStartX = this.lastPointerDownX;
          this.selectionStartY = this.lastPointerDownY;

          if (this.transformHandler) {
            this.selectionStartCell = this.transformHandler.screenToWorldCoordinates(
              this.lastPointerDownX,
              this.lastPointerDownY
            );
            const currentCell = this.transformHandler.screenToWorldCoordinates(
              event.clientX,
              event.clientY
            );

            this.eventBus.emit(new SelectionBoxStartEvent(
              this.selectionStartCell,
              this.lastPointerDownX,
              this.lastPointerDownY
            ));
            this.eventBus.emit(new SelectionBoxUpdateEvent(
              this.selectionStartCell,
              currentCell,
              this.selectionStartX,
              this.selectionStartY,
              event.clientX,
              event.clientY
            ));
          }
        } else {
          // Still within click threshold, pan the map
          const deltaX = event.clientX - this.lastPointerX;
          const deltaY = event.clientY - this.lastPointerY;

          this.eventBus.emit(new DragEvent(deltaX, deltaY));

          this.lastPointerX = event.clientX;
          this.lastPointerY = event.clientY;
        }
      } else {
        const deltaX = event.clientX - this.lastPointerX;
        const deltaY = event.clientY - this.lastPointerY;

        this.eventBus.emit(new DragEvent(deltaX, deltaY));

        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
      }
    } else if (this.pointers.size === 2) {
      const currentPinchDistance = this.getPinchDistance();
      const pinchDelta = currentPinchDistance - this.lastPinchDistance;

      if (Math.abs(pinchDelta) > 1) {
        const zoomCenter = this.getPinchCenter();
        this.eventBus.emit(
          new ZoomEvent(zoomCenter.x, zoomCenter.y, -pinchDelta * 2),
        );
        this.lastPinchDistance = currentPinchDistance;
      }
    }
  }

  private onContextMenu(event: MouseEvent) {
    event.preventDefault();
    this.eventBus.emit(new ContextMenuEvent(event.clientX, event.clientY));
  }

  private getPinchDistance(): number {
    const pointerEvents = Array.from(this.pointers.values());
    const dx = pointerEvents[0].clientX - pointerEvents[1].clientX;
    const dy = pointerEvents[0].clientY - pointerEvents[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPinchCenter(): { x: number; y: number } {
    const pointerEvents = Array.from(this.pointers.values());
    return {
      x: (pointerEvents[0].clientX + pointerEvents[1].clientX) / 2,
      y: (pointerEvents[0].clientY + pointerEvents[1].clientY) / 2,
    };
  }

  destroy() {
    if (this.moveInterval !== null) {
      clearInterval(this.moveInterval);
    }
    this.activeKeys.clear();
  }
}
