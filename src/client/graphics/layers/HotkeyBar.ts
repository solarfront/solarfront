import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import warshipIcon from "../../../../resources/images/BattleshipIconWhite.svg";
import cityIcon from "../../../../resources/images/CityIconWhite.svg";
import condorIcon from "../../../../resources/images/condor.svg";
import defensePostIcon from "../../../../resources/images/ShieldIconWhite.svg";
import missileSiloIcon from "../../../../resources/images/MissileSiloIconWhite.svg";
import hydrogenBombIcon from "../../../../resources/images/MushroomCloudIconWhite.svg";
import atomBombIcon from "../../../../resources/images/NukeIconWhite.svg";
import orbitalCannonIcon from "../../../../resources/images/OrbitalCannon.svg";
import portIcon from "../../../../resources/images/PortIcon.svg";
import samLauncherIcon from "../../../../resources/images/SamLauncherIconWhite.svg";
import spaceshipIcon from "../../../../resources/images/SpaceshipIconWhite.svg";
import { EventBus } from "../../../core/EventBus";
import { UnitType } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { HotkeyUnitEvent } from "../../InputHandler";
import { BuildUnitIntentEvent } from "../../Transport";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";
import { renderNumber } from "../../Utils";

@customElement("hotkey-bar")
export class HotkeyBar extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public transformHandler: TransformHandler;

  @state()
  private _isVisible = false;

  @state()
  private _hasMissileSilo = false;

  @state()
  private _hasSpacePort = false;

  @state()
  private _hoveredUnit: UnitType | null = null;

  @state()
  private _tooltipPosition = { x: 0, y: 0 };

  private tooltipElement: HTMLDivElement | null = null;
  
  @state()
  private _isDragging = false;
  
  @state()
  private _draggedUnit: UnitType | null = null;
  
  private _dragGhost: HTMLDivElement | null = null;

  static styles = css`
    .hotkey-container {
      display: flex;
      gap: 5px;
      background: rgba(31, 41, 55, 0.9);
      padding: 3px;
      border-radius: 4px;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      width: fit-content;
    }

    .hotkey-button {
      position: relative;
      width: 20px;
      height: 20px;
      background: rgba(55, 65, 81, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .hotkey-button:hover:not(.disabled) {
      background: rgba(75, 85, 99, 0.9);
      border-color: rgba(255, 255, 255, 0.4);
      transform: translateY(-1px);
    }

    .hotkey-button.enabled {
      border-color: rgba(34, 197, 94, 0.7);
      background: rgba(34, 197, 94, 0.15);
      box-shadow: 0 0 4px rgba(34, 197, 94, 0.3);
    }

    .hotkey-button.enabled:hover {
      border-color: rgba(34, 197, 94, 0.9);
      background: rgba(34, 197, 94, 0.25);
      box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
    }

    .hotkey-button.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .hotkey-icon {
      width: 12px;
      height: 12px;
      filter: brightness(0.8);
    }

    .hotkey-button.enabled .hotkey-icon {
      filter: brightness(1.1);
    }

    .hotkey-number {
      position: absolute;
      bottom: 0px;
      right: 1px;
      color: white;
      font-size: 7px;
      font-weight: bold;
      text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.9);
      line-height: 1;
    }

    .hidden {
      display: none;
    }
  `;

  createRenderRoot() {
    return this;
  }
  
  private initialized = false;

  init() {
    // Prevent duplicate initialization
    if (this.initialized) {
      console.warn("HotkeyBar already initialized, skipping...");
      return;
    }
    this.initialized = true;
    this.eventBus.on(HotkeyUnitEvent, (event) => this.onHotkeyUnit(event));
  }

  private _lastPlayerGold: number = 0;
  private _goldIncreaseTimestamp: number = 0;
  
  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisible(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisible(false);
      return;
    }

    // Check if player has required buildings and gold
    const hasMissileSilo = player.units(UnitType.MissileSilo).length > 0;
    const hasSpacePort = player.units(UnitType.Port).length > 0;
    const currentGold = player.gold();
    
    // Update if prerequisites changed
    if (hasMissileSilo !== this._hasMissileSilo || 
        hasSpacePort !== this._hasSpacePort) {
      this._hasMissileSilo = hasMissileSilo;
      this._hasSpacePort = hasSpacePort;
      this._lastPlayerGold = currentGold;
      this.requestUpdate();
      return;
    }
    
    // Handle gold changes with special logic to prevent flashing
    if (currentGold !== this._lastPlayerGold) {
      const goldIncreased = currentGold > this._lastPlayerGold;
      
      if (goldIncreased) {
        // Gold increased - might be a refund during construction completion
        // Mark the timestamp and wait before updating
        if (this._goldIncreaseTimestamp === 0) {
          this._goldIncreaseTimestamp = Date.now();
        }
        
        // Only update if the gold increase has been stable for 200ms
        // This filters out the brief refund during construction completion
        if (Date.now() - this._goldIncreaseTimestamp > 200) {
          this._lastPlayerGold = currentGold;
          this._goldIncreaseTimestamp = 0;
          this.requestUpdate();
        }
      } else {
        // Gold decreased - update immediately (player spent money)
        this._lastPlayerGold = currentGold;
        this._goldIncreaseTimestamp = 0;
        this.requestUpdate();
      }
    } else {
      // Gold unchanged - reset timestamp
      this._goldIncreaseTimestamp = 0;
    }
  }

  private setVisible(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  private onHotkeyUnit(event: HotkeyUnitEvent) {
    console.log(`HotkeyBar.onHotkeyUnit called for ${event.unitType}`);
    
    if (!this._isVisible) {
      console.log("HotkeyBar not visible, ignoring");
      return;
    }

    const player = this.game.myPlayer();
    if (!player || !player.isAlive()) {
      console.log("Player not alive, ignoring");
      return;
    }

    // Check if player has required buildings
    const requiresMissileSilo = [
      UnitType.AtomBomb,
      UnitType.HydrogenBomb,
    ].includes(event.unitType);
    const requiresSpacePort = [UnitType.Viper, UnitType.Condor].includes(
      event.unitType,
    );

    if (requiresMissileSilo && !this._hasMissileSilo) {
      console.log("No missile silo, ignoring");
      return;
    }
    if (requiresSpacePort && !this._hasSpacePort) {
      console.log("No space port, ignoring");
      return;
    }

    // Convert screen coordinates to world coordinates
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );

    if (!this.game.isValidCoord(cell.x, cell.y)) {
      console.log("Invalid coordinates, ignoring");
      return;
    }

    // Emit build unit event
    console.log(`Emitting BuildUnitIntentEvent for ${event.unitType} at ${cell.x}, ${cell.y}`);
    this.eventBus.emit(new BuildUnitIntentEvent(event.unitType, cell));
  }

  private getDefaultCost(unitType: UnitType, player: any): number {
    // Doubled static costs (no scaling)
    const costs: Partial<Record<UnitType, number>> = {
      [UnitType.City]: 125000,           // Doubled from 62,500
      [UnitType.Port]: 125000,           // Doubled from 62,500
      [UnitType.DefensePost]: 100000,    // Doubled from 50,000
      [UnitType.MissileSilo]: 1000000,   // Doubled from 500,000
      [UnitType.AtomBomb]: 750000,       // Doubled from 375,000
      [UnitType.HydrogenBomb]: 5000000,  // Doubled from 2,500,000
      [UnitType.Viper]: 250000,          // Doubled from 125,000
      [UnitType.Condor]: 1000000,        // Doubled from 500,000
      [UnitType.SAMLauncher]: 1000000,   // Doubled from 500,000
      [UnitType.OrbitalCannon]: 1000000, // Doubled from 500,000
    };
    
    return costs[unitType] || 0;
  }

  private getUnitInfo(unitType: UnitType) {
    const player = this.game.myPlayer();
    if (!player) return null;

    const unitInfo = this.game.config().unitInfo(unitType);
    let cost = 0;
    
    // Try to get cost, but handle errors gracefully
    try {
      if (unitInfo.cost) {
        // Check if player has the required methods
        if (typeof unitInfo.cost === 'function') {
          // For some units, the cost function needs the full Player object
          // Since we only have PlayerView, we'll use default costs
          cost = this.getDefaultCost(unitType, player);
        }
      }
    } catch (e) {
      console.warn('Error getting unit cost:', e);
      cost = this.getDefaultCost(unitType, player);
    }

    // Get build time from game config (convert ticks to seconds)
    const buildTime = unitInfo.constructionDuration 
      ? `${unitInfo.constructionDuration / 10} second${(unitInfo.constructionDuration / 10) !== 1 ? 's' : ''}`
      : "Instant";

    const unitData: Partial<Record<UnitType, { name: string; description: string; prerequisite?: string }>> = {
      [UnitType.City]: {
        name: "Colony",
        description: "Increases max population capacity",
      },
      [UnitType.Port]: {
        name: "Space Port",
        description: "Enables trade ships and starship construction",
      },
      [UnitType.DefensePost]: {
        name: "Defense Post",
        description: "Increases border defense, slows enemy attacks",
      },
      [UnitType.MissileSilo]: {
        name: "Missile Silo",
        description: "Required for launching nuclear missiles",
      },
      [UnitType.AtomBomb]: {
        name: "Atom Bomb",
        description: "Small nuclear weapon, destroys territory",
        prerequisite: "Missile Silo",
      },
      [UnitType.HydrogenBomb]: {
        name: "Fusion Bomb",
        description: "Large nuclear weapon, massive destruction",
        prerequisite: "Missile Silo",
      },
      [UnitType.Viper]: {
        name: "Viper",
        description: "Fast patrol ship, intercepts enemies",
        prerequisite: "Space Port",
      },
      [UnitType.Condor]: {
        name: "Condor",
        description: "Heavy destroyer, slow but powerful",
        prerequisite: "Space Port",
      },
      [UnitType.SAMLauncher]: {
        name: "Shield Cannon",
        description: "75% chance to intercept missiles in range",
      },
      [UnitType.OrbitalCannon]: {
        name: "Orbital Cannon",
        description: "Long-range bombardment weapon",
      },
      [UnitType.TransportShip]: {
        name: "Transport Ship",
        description: "Send troops by sea to attack or reinforce",
      },
    };

    const data = unitData[unitType];
    if (!data) return null;

    return {
      ...data,
      cost,
      buildTime,
    };
  }

  private createTooltipElement() {
    if (!this.tooltipElement) {
      this.tooltipElement = document.createElement('div');
      this.tooltipElement.style.cssText = `
        position: fixed;
        background: rgba(17, 24, 39, 0.95);
        border: 1px solid rgba(59, 130, 246, 0.5);
        border-radius: 6px;
        padding: 10px;
        min-width: 180px;
        max-width: 250px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        z-index: 10000;
        pointer-events: none;
        display: none;
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12px;
      `;
      document.body.appendChild(this.tooltipElement);
    }
  }

  private updateTooltip() {
    this.createTooltipElement();
    
    if (!this.tooltipElement) return;

    if (!this._hoveredUnit) {
      this.tooltipElement.style.display = 'none';
      return;
    }

    const info = this.getUnitInfo(this._hoveredUnit);
    if (!info) {
      this.tooltipElement.style.display = 'none';
      return;
    }

    const isDisabled = 
      (info.prerequisite === "Missile Silo" && !this._hasMissileSilo) ||
      (info.prerequisite === "Space Port" && !this._hasSpacePort);

    this.tooltipElement.innerHTML = `
      <div style="color: #60a5fa; font-size: 14px; font-weight: 600; margin-bottom: 6px;">
        ${info.name}
      </div>
      <div style="color: #d1d5db; font-size: 12px; margin-bottom: 8px; line-height: 1.4;">
        ${info.description}
      </div>
      <div style="display: flex; justify-content: space-between; color: #fbbf24; font-size: 12px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
        <span style="color: #9ca3af;">Cost:</span>
        <span style="font-weight: 600;">${renderNumber(info.cost)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; color: #a78bfa; font-size: 12px; margin-top: 4px;">
        <span style="color: #9ca3af;">Build Time:</span>
        <span style="font-weight: 600;">${info.buildTime}</span>
      </div>
      ${info.prerequisite && isDisabled ? `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <span style="color: #f87171; font-size: 11px; font-weight: 500;">
            ⚠ Requires: ${info.prerequisite}
          </span>
        </div>
      ` : ''}
    `;

    this.tooltipElement.style.left = `${this._tooltipPosition.x}px`;
    this.tooltipElement.style.top = `${this._tooltipPosition.y}px`;
    this.tooltipElement.style.transform = 'translate(-50%, -100%) translateY(-10px)';
    this.tooltipElement.style.display = 'block';
  }

  private handleMouseEnter(unitType: UnitType, event: MouseEvent) {
    if (this._isDragging) return;
    this._hoveredUnit = unitType;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this._tooltipPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    };
    this.updateTooltip();
  }

  private handleMouseLeave() {
    if (this._isDragging) return;
    this._hoveredUnit = null;
    this.updateTooltip();
  }

  private handleDragStart(unitType: UnitType, event: DragEvent) {
    // Check if player can build this unit
    const player = this.game.myPlayer();
    if (!player || !player.isAlive()) return;

    // Check if unit is enabled (prerequisites + affordability)
    if (!this.isUnitEnabled(unitType)) {
      event.preventDefault();
      return;
    }

    this._isDragging = true;
    this._draggedUnit = unitType;
    this._hoveredUnit = null;
    this.updateTooltip();

    // Create drag image with unit icon
    const dragElement = event.currentTarget as HTMLElement;
    const icon = dragElement.querySelector('.hotkey-icon') as HTMLImageElement;
    
    const dragImage = document.createElement('div');
    dragImage.style.cssText = `
      width: 48px;
      height: 48px;
      background: rgba(34, 197, 94, 0.2);
      border: 2px solid rgba(34, 197, 94, 0.8);
      border-radius: 6px;
      position: absolute;
      top: -1000px;
      left: -1000px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    if (icon) {
      const iconCopy = icon.cloneNode(true) as HTMLImageElement;
      iconCopy.style.cssText = 'width: 32px; height: 32px; filter: brightness(1.2);';
      dragImage.appendChild(iconCopy);
    }
    
    document.body.appendChild(dragImage);
    event.dataTransfer?.setDragImage(dragImage, 24, 24);
    
    // Store unit type in dataTransfer
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('unitType', unitType.toString());
    }

    // Clean up drag image after a moment
    setTimeout(() => dragImage.remove(), 100);
  }

  private handleDragEnd(event: DragEvent) {
    this._isDragging = false;
    this._draggedUnit = null;
    this.requestUpdate();
  }

  private canAfford(unitType: UnitType): boolean {
    const player = this.game.myPlayer();
    if (!player || !player.isAlive()) return false;
    
    const unitInfo = this.game.unitInfo(unitType);
    const cost = unitInfo.cost(player);
    return player.gold() >= cost;
  }

  private isUnitEnabled(unitType: UnitType): boolean {
    // Check prerequisites first
    const requiresMissileSilo = [
      UnitType.AtomBomb,
      UnitType.HydrogenBomb,
    ].includes(unitType);
    const requiresSpacePort = [UnitType.Viper, UnitType.Condor].includes(
      unitType,
    );

    if (requiresMissileSilo && !this._hasMissileSilo) return false;
    if (requiresSpacePort && !this._hasSpacePort) return false;
    
    // Then check if player can afford it
    return this.canAfford(unitType);
  }

  private canSendTransportShip(): boolean {
    const player = this.game.myPlayer();
    if (!player || !player.isAlive()) return false;
    
    // Check if player has troops to send
    if (player.troops() <= 0) return false;
    
    // Check if player has territory near water (simplified check)
    // In a real implementation, we'd check for shore tiles
    return true;
  }

  private handleTransportShipMouseEnter(e: MouseEvent) {
    if (this._isDragging) return;
    
    this._hoveredUnit = UnitType.TransportShip;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this._tooltipPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    };
    this.updateTooltip();
  }

  render() {
    if (!this._isVisible) {
      return html``;
    }

    return html`
      <div style="position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%); z-index: 1000;">
        <style>
          .hotkey-container {
            display: flex;
            gap: 4px;
            background: rgba(31, 41, 55, 0.9);
            padding: 5px;
            border-radius: 6px;
            backdrop-filter: blur(6px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          }

          .hotkey-button {
            position: relative;
            width: 36px;
            height: 36px;
            background: rgba(55, 65, 81, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.25);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .hotkey-button:hover:not(.disabled) {
            background: rgba(75, 85, 99, 0.9);
            border-color: rgba(255, 255, 255, 0.4);
            transform: translateY(-1px);
          }

          .hotkey-button.enabled {
            opacity: 1;
          }

          .hotkey-button.enabled:hover {
            border-color: rgba(34, 197, 94, 0.9);
            background: rgba(34, 197, 94, 0.25);
            box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
          }

          .hotkey-button.disabled {
            opacity: 0.4;
            cursor: not-allowed;
            filter: grayscale(0.5);
          }

          .hotkey-icon {
            width: 20px;
            height: 20px;
            filter: brightness(0.9);
          }

          .hotkey-button.enabled .hotkey-icon {
            filter: brightness(1.1);
          }

          .hotkey-number {
            position: absolute;
            bottom: 1px;
            right: 1px;
            background: rgba(0, 0, 0, 0.8);
            color: rgba(255, 255, 255, 0.9);
            font-size: 9px;
            font-weight: 600;
            padding: 1px 3px;
            border-radius: 2px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            line-height: 1;
          }
        </style>

        <div class="hotkey-container">
          <!-- Colony (1) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.City) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.City) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.City, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.City, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${cityIcon}" alt="Colony" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">1</span>
          </div>

          <!-- Space Port (2) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.Port) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.Port) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.Port, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.Port, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${portIcon}" alt="Space Port" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">2</span>
          </div>

          <!-- Defense Post (3) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.DefensePost) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.DefensePost) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.DefensePost, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.DefensePost, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${defensePostIcon}" alt="Defense Post" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">3</span>
          </div>

          <!-- Missile Silo (4) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.MissileSilo) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.MissileSilo) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.MissileSilo, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.MissileSilo, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${missileSiloIcon}" alt="Missile Silo" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">4</span>
          </div>

          <!-- Atom Bomb (5) -->
          <div
            class="hotkey-button ${this.isUnitEnabled(UnitType.AtomBomb) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.AtomBomb) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.AtomBomb, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.AtomBomb, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${atomBombIcon}" alt="Atom Bomb" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">5</span>
          </div>

          <!-- Fusion Bomb (6) -->
          <div
            class="hotkey-button ${this.isUnitEnabled(UnitType.HydrogenBomb) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.HydrogenBomb) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.HydrogenBomb, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.HydrogenBomb, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${hydrogenBombIcon}" alt="Fusion Bomb" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">6</span>
          </div>

          <!-- Viper (7) -->
          <div
            class="hotkey-button ${this.isUnitEnabled(UnitType.Viper) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.Viper) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.Viper, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.Viper, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${warshipIcon}" alt="Viper" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">7</span>
          </div>

          <!-- Condor (8) -->
          <div
            class="hotkey-button ${this.isUnitEnabled(UnitType.Condor) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.Condor) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.Condor, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.Condor, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${condorIcon}" alt="Condor" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">8</span>
          </div>

          <!-- Shield Cannon (9) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.SAMLauncher) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.SAMLauncher) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.SAMLauncher, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.SAMLauncher, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${samLauncherIcon}" alt="Shield Cannon" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">9</span>
          </div>

          <!-- Orbital Cannon (0) -->
          <div 
            class="hotkey-button ${this.isUnitEnabled(UnitType.OrbitalCannon) ? "enabled" : "disabled"}"
            draggable="${this.isUnitEnabled(UnitType.OrbitalCannon) ? 'true' : 'false'}"
            @dragstart=${(e: DragEvent) => this.handleDragStart(UnitType.OrbitalCannon, e)}
            @dragend=${(e: DragEvent) => this.handleDragEnd(e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(UnitType.OrbitalCannon, e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${orbitalCannonIcon}" alt="Orbital Cannon" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">0</span>
          </div>

          <!-- Transport Ship (~) -->
          <div 
            class="hotkey-button ${this.canSendTransportShip() ? "enabled" : "disabled"}"
            @mouseenter=${(e: MouseEvent) => this.handleTransportShipMouseEnter(e)}
            @mouseleave=${() => this.handleMouseLeave()}>
            <img src="${spaceshipIcon}" alt="Transport Ship" class="hotkey-icon" draggable="false" />
            <span class="hotkey-number">~</span>
          </div>
        </div>
      </div>
    `;
  }
}
