import { LitElement, TemplateResult, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import {
  PlayerProfile,
  PlayerType,
  Relation,
  Unit,
  UnitType,
} from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameView, PlayerView, UnitView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { MouseMoveEvent } from "../../InputHandler";
import { renderNumber, renderTroops } from "../../Utils";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

function euclideanDistWorld(
  coord: { x: number; y: number },
  tileRef: TileRef,
  game: GameView,
): number {
  const x = game.x(tileRef);
  const y = game.y(tileRef);
  const dx = coord.x - x;
  const dy = coord.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distSortUnitWorld(coord: { x: number; y: number }, game: GameView) {
  return (a: Unit | UnitView, b: Unit | UnitView) => {
    const distA = euclideanDistWorld(coord, a.tile(), game);
    const distB = euclideanDistWorld(coord, b.tile(), game);
    return distA - distB;
  };
}

@customElement("player-info-overlay")
export class PlayerInfoOverlay extends LitElement implements Layer {
  @property({ type: Object })
  public game!: GameView;

  @property({ type: String })
  public clientID!: ClientID;

  @property({ type: Object })
  public eventBus!: EventBus;

  @property({ type: Object })
  public transform!: TransformHandler;

  @state()
  private player: PlayerView | null = null;

  @state()
  private playerProfile: PlayerProfile | null = null;

  @state()
  private unit: UnitView | null = null;

  @state()
  private _isInfoVisible: boolean = false;

  private _isActive = false;

  private lastMouseUpdate = 0;

  init() {
    this.eventBus.on(MouseMoveEvent, (e: MouseMoveEvent) =>
      this.onMouseEvent(e),
    );
    this._isActive = true;
  }

  private onMouseEvent(event: MouseMoveEvent) {
    const now = Date.now();
    if (now - this.lastMouseUpdate < 100) {
      return;
    }
    this.lastMouseUpdate = now;
    this.maybeShow(event.x, event.y);
  }

  public hide() {
    this.setVisible(false);
    this.unit = null;
    this.player = null;
  }

  public maybeShow(x: number, y: number) {
    this.hide();
    const worldCoord = this.transform.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(worldCoord.x, worldCoord.y)) {
      return;
    }

    const tile = this.game.ref(worldCoord.x, worldCoord.y);
    if (!tile) return;

    const owner = this.game.owner(tile);

    // Check for units with health at this location (including structures that occupy multiple tiles)
    const unitsAtTile = this.game
      .units()
      .filter((u) => {
        if (!u.hasHealth()) return false;

        // For structures, check if the hovered tile is within their area
        const structureTypes = [
          UnitType.OrbitalCannon,
          UnitType.SAMLauncher,
          UnitType.MissileSilo,
          UnitType.DefensePost,
          UnitType.Port,
          UnitType.City,
        ];

        if (structureTypes.includes(u.type())) {
          // Check if hovered tile is within ~9 tiles of the structure center (borderRadius is 8.525)
          const dist = this.game.manhattanDist(u.tile(), tile);
          return dist <= 9;
        }

        // For non-structures, check exact tile match
        return u.tile() === tile;
      })
      .sort((a, b) => {
        // Sort by distance to hovered tile
        const distA = this.game.manhattanDist(a.tile(), tile);
        const distB = this.game.manhattanDist(b.tile(), tile);
        if (distA !== distB) return distA - distB;

        // Then prioritize certain unit types
        const priority = [
          UnitType.OrbitalCannon,
          UnitType.Viper,
          UnitType.Condor,
        ];
        const aPriority = priority.indexOf(a.type());
        const bPriority = priority.indexOf(b.type());
        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return 0;
      });

    if (unitsAtTile.length > 0) {
      this.unit = unitsAtTile[0];
      this.setVisible(true);
      return;
    } else if (owner && owner.isPlayer()) {
      this.player = owner as PlayerView;
      this.player.profile().then((p) => {
        this.playerProfile = p;
      });
      this.setVisible(true);
    } else if (!this.game.isLand(tile)) {
      const units = this.game
        .units(
          UnitType.Viper,
          UnitType.Condor,
          UnitType.TradeShip,
          UnitType.TransportShip,
        )
        .filter((u) => euclideanDistWorld(worldCoord, u.tile(), this.game) < 50)
        .sort(distSortUnitWorld(worldCoord, this.game));

      if (units.length > 0) {
        this.unit = units[0];
        this.setVisible(true);
      }
    }
  }

  tick() {
    // If we're showing a unit, refresh its data to get latest HP
    if (this.unit && this._isInfoVisible) {
      const freshUnit = this.game.unit(this.unit.id());
      if (freshUnit && freshUnit.isActive()) {
        this.unit = freshUnit;
      } else {
        // Unit no longer exists or is inactive
        this.hide();
      }
    }
    this.requestUpdate();
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Implementation for Layer interface
  }

  shouldTransform(): boolean {
    return false;
  }

  setVisible(visible: boolean) {
    this._isInfoVisible = visible;
    this.requestUpdate();
  }

  private myPlayer(): PlayerView | null {
    if (!this.game) {
      return null;
    }
    return this.game.playerByClientID(this.clientID);
  }

  private getRelationClass(relation: Relation): string {
    switch (relation) {
      case Relation.Hostile:
        return "text-red-500";
      case Relation.Distrustful:
        return "text-red-300";
      case Relation.Neutral:
        return "text-white";
      case Relation.Friendly:
        return "text-green-500";
      default:
        return "text-white";
    }
  }

  private getRelationName(relation: Relation): string {
    switch (relation) {
      case Relation.Hostile:
        return translateText("relation.hostile");
      case Relation.Distrustful:
        return translateText("relation.distrustful");
      case Relation.Neutral:
        return translateText("relation.neutral");
      case Relation.Friendly:
        return translateText("relation.friendly");
      default:
        return translateText("relation.default");
    }
  }

  private renderPlayerInfo(player: PlayerView) {
    const myPlayer = this.myPlayer();
    const isFriendly = myPlayer?.isFriendly(player);
    let relationHtml: TemplateResult | null = null;
    const attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);

    if (player.type() === PlayerType.FakeHuman && myPlayer !== null) {
      const relation =
        this.playerProfile?.relations[myPlayer.smallID()] ?? Relation.Neutral;
      const relationClass = this.getRelationClass(relation);
      const relationName = this.getRelationName(relation);

      relationHtml = html`
        <div class="text-sm opacity-80">
          ${translateText("player_info_overlay.attitude")}:
          <span class="${relationClass}">${relationName}</span>
        </div>
      `;
    }
    let playerType = "";
    switch (player.type()) {
      case PlayerType.Bot:
        playerType = translateText("player_info_overlay.bot");
        break;
      case PlayerType.FakeHuman:
        playerType = translateText("player_info_overlay.nation");
        break;
      case PlayerType.Human:
        playerType = translateText("player_info_overlay.player");
        break;
    }

    return html`
      <div class="p-2">
        <div
          class="text-bold text-sm lg:text-lg font-bold mb-1 inline-flex ${isFriendly
            ? "text-green-500"
            : "text-white"}"
        >
          ${player.flag()
            ? html`<img
                class="h-8 mr-1 aspect-[1/1]"
                src=${player.type() === PlayerType.FakeHuman
                  ? "/Portraits/nations/" + player.flag() + ".png"
                  : "/Portraits/portrait_" + player.flag() + ".png"}
              />`
            : ""}
          ${player.name()}
        </div>
        ${player.team() !== null
          ? html`<div class="text-sm opacity-80">
              ${translateText("player_info_overlay.team")}: ${player.team()}
            </div>`
          : ""}
        <div class="text-sm opacity-80">
          ${translateText("player_info_overlay.type")}: ${playerType}
        </div>
        ${player.troops() >= 1
          ? html`<div class="text-sm opacity-80" translate="no">
              ${translateText("player_info_overlay.d_troops")}:
              ${renderTroops(player.troops())}
            </div>`
          : ""}
        ${attackingTroops >= 1
          ? html`<div class="text-sm opacity-80" translate="no">
              ${translateText("player_info_overlay.a_troops")}:
              ${renderTroops(attackingTroops)}
            </div>`
          : ""}
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.gold")}:
          ${renderNumber(player.gold())}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.ports")}:
          ${"🏭 " + player.units(UnitType.Port).length} &nbsp;&nbsp;&nbsp;
          ${player.units(UnitType.Condor).length} &nbsp;&nbsp;&nbsp; &nbsp;
          ${player.units(UnitType.Condor).length}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.cities")}:
          ${player.units(UnitType.City).length}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.missile_launchers")}:
          ${player.units(UnitType.MissileSilo).length}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.sams")}:
          ${player.units(UnitType.SAMLauncher).length}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.warships")}:
          ${player.units(UnitType.Viper).length}
        </div>
        <div class="text-sm opacity-80" translate="no">
          ${translateText("player_info_overlay.viper2s")}:
          ${player.units(UnitType.Condor).length}
        </div>
        ${relationHtml}
      </div>
    `;
  }

  private renderUnitInfo(unit: UnitView) {
    const isAlly =
      (unit.owner() === this.myPlayer() ||
        this.myPlayer()?.isFriendly(unit.owner())) ??
      false;

    // Get proper display name for unit type
    let displayName: string;
    switch (unit.type()) {
      case UnitType.OrbitalCannon:
        displayName = "Orbital Cannon";
        break;
      case UnitType.Viper:
        displayName = "Viper";
        break;
      case UnitType.Condor:
        displayName = "Condor";
        break;
      case UnitType.TransportShip:
        displayName = "Transport Ship";
        break;
      case UnitType.TradeShip:
        displayName = "Trade Ship";
        break;
      default:
        displayName = unit.type();
    }

    return html`
      <div class="p-2">
        <div class="font-bold mb-1 ${isAlly ? "text-green-500" : "text-white"}">
          ${unit.owner().name()}
        </div>
        <div class="mt-1">
          <div class="text-sm opacity-80">${displayName}</div>
          ${unit.hasHealth()
            ? html`
                <div class="text-sm opacity-80">
                  ${translateText("player_info_overlay.health")}:
                  ${unit.health()}
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  render() {
    if (!this._isActive) {
      return html``;
    }

    const containerClasses = this._isInfoVisible
      ? "opacity-100 visible"
      : "opacity-0 invisible pointer-events-none";

    return html`
      <div
        class="flex w-full z-50 flex-col"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div
          class="bg-opacity-60 bg-gray-900 rounded-lg shadow-lg backdrop-blur-sm transition-all duration-300  text-white text-lg md:text-base ${containerClasses}"
        >
          ${this.player !== null ? this.renderPlayerInfo(this.player) : ""}
          ${this.unit !== null ? this.renderUnitInfo(this.unit) : ""}
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
