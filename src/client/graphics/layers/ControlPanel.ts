import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import { GameView } from "../../../core/game/GameView";
import { ClientID } from "../../../core/Schemas";
import { AttackRatioEvent } from "../../InputHandler";
import { SendAutoPlayToggleEvent, SendAutoPlayAttackRatioUpdateEvent, SendSetTargetTroopRatioEvent } from "../../Transport";
import { renderNumber, renderTroops } from "../../Utils";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { Layer } from "./Layer";

@customElement("control-panel")
export class ControlPanel extends LitElement implements Layer {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;
  public transformHandler: TransformHandler;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private targetTroopRatio = 0.95;

  @state()
  private currentTroopRatio = 0.95;

  @state()
  private _population: number;

  @state()
  private _maxPopulation: number;

  @state()
  private popRate: number;

  @state()
  private _troops: number;

  @state()
  private _workers: number;

  @state()
  private _isVisible = false;

  @state()
  private _manpower: number = 0;

  @state()
  private _autoPlayEnabled = localStorage.getItem("settings.autoPlayOnSpawn") !== "false"; // Auto-play enabled by default unless disabled in settings

  @state()
  private _autoBuild = true; // Auto building enabled by default

  @state()
  private _autoShip = true; // Auto ship spawning enabled by default

  @state()
  private _autoAttack = true; // Auto attacking enabled by default

  private _autoPlayInitialized = false; // Track if auto-play toggle has been sent

  @state()
  private _gold: number;

  @state()
  private _goldPerSecond: number;

  private _lastPopulationIncreaseRate: number;

  private _popRateIsIncreasing: boolean = true;

  private init_: boolean = false;

  init() {
    this.attackRatio = Number(
      localStorage.getItem("settings.attackRatio") ?? "0.2",
    );
    this.targetTroopRatio = Number(
      localStorage.getItem("settings.troopRatio") ?? "0.95",
    );
    this.init_ = true;
    this.uiState.attackRatio = this.attackRatio;
    this.currentTroopRatio = this.targetTroopRatio;
    
    // Note: Auto-play toggle moved to tick() method to wait for player spawn
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio =
        (parseInt(
          (document.getElementById("attack-ratio") as HTMLInputElement).value,
        ) +
          event.attackRatio) /
        100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (this.init_) {
      this.eventBus.emit(
        new SendSetTargetTroopRatioEvent(this.targetTroopRatio),
      );
      this.init_ = false;
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    // Initialize auto-play once player has spawned and is alive
    if (!this._autoPlayInitialized && this._autoPlayEnabled && player.hasSpawned()) {
      this._autoPlayInitialized = true;
      this.eventBus.emit(new SendAutoPlayToggleEvent(true, this._autoBuild, this._autoShip, this._autoAttack, this.attackRatio));
    }

    // Show control panel if we have a living player and we're not in spawn phase
    if (!this.game.inSpawnPhase() && !this._isVisible) {
      this.setVisibile(true);
    }

    const popIncreaseRate = player.population() - this._population;
    if (this.game.ticks() % 5 === 0) {
      this._popRateIsIncreasing =
        popIncreaseRate >= this._lastPopulationIncreaseRate;
      this._lastPopulationIncreaseRate = popIncreaseRate;
    }

    this._population = player.population();
    this._maxPopulation = this.game.config().maxPopulation(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._workers = player.workers();
    this.popRate = this.game.config().populationIncreaseRate(player) * 10;
    this._goldPerSecond = this.game.config().goldAdditionRate(player) * 10;

    this.currentTroopRatio = player.troops() / player.population();
    
    this.requestUpdate();
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
    
    // If auto play is enabled, send the updated attack ratio to the server
    if (this._autoPlayEnabled) {
      this.eventBus.emit(new SendAutoPlayAttackRatioUpdateEvent(newRatio));
      console.log(`Auto-play attack ratio updated: ${newRatio}`);
    }
  }


  renderLayer(context: CanvasRenderingContext2D) {
    // Render any necessary canvas elements
  }

  shouldTransform(): boolean {
    return false;
  }

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  targetTroops(): number {
    return this._manpower * this.targetTroopRatio;
  }

  onTroopChange(newRatio: number) {
    this.eventBus.emit(new SendSetTargetTroopRatioEvent(newRatio));
  }

  toggleAutoPlay() {
    this._autoPlayEnabled = !this._autoPlayEnabled;
    this.eventBus.emit(new SendAutoPlayToggleEvent(this._autoPlayEnabled, this._autoBuild, this._autoShip, this._autoAttack, this.attackRatio));
    console.log(`Auto-play toggled: ${this._autoPlayEnabled} with attack ratio: ${this.attackRatio}`);
  }

  toggleAutoBuild() {
    this._autoBuild = !this._autoBuild;
    if (this._autoPlayEnabled) {
      this.eventBus.emit(new SendAutoPlayToggleEvent(true, this._autoBuild, this._autoShip, this._autoAttack, this.attackRatio));
      console.log(`Auto-build toggled: ${this._autoBuild}`);
    }
  }

  toggleAutoShip() {
    this._autoShip = !this._autoShip;
    if (this._autoPlayEnabled) {
      this.eventBus.emit(new SendAutoPlayToggleEvent(true, this._autoBuild, this._autoShip, this._autoAttack, this.attackRatio));
      console.log(`Auto-ship toggled: ${this._autoShip}`);
    }
  }

  toggleAutoAttack() {
    this._autoAttack = !this._autoAttack;
    if (this._autoPlayEnabled) {
      this.eventBus.emit(new SendAutoPlayToggleEvent(true, this._autoBuild, this._autoShip, this._autoAttack, this.attackRatio));
      console.log(`Auto-attack toggled: ${this._autoAttack}`);
    }
  }


  delta(): number {
    const d = this._population - this.targetTroops();
    return d;
  }

  render() {
    if (!this._isVisible) {
      return html``;
    }
    return html`
      <style>
        input[type="range"] {
          -webkit-appearance: none;
          background: transparent;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        .targetTroopRatio::-webkit-slider-thumb {
          border-color: rgb(59 130 246);
        }
        .targetTroopRatio::-moz-range-thumb {
          border-color: rgb(59 130 246);
        }
        .attackRatio::-webkit-slider-thumb {
          border-color: rgb(239 68 68);
        }
        .attackRatio::-moz-range-thumb {
          border-color: rgb(239 68 68);
        }
      </style>
      
      <div
        class="w-full text-sm lg:text-m lg:w-72 bg-gray-800/70 p-2 pr-3 lg:p-4 shadow-lg lg:rounded-lg backdrop-blur"
        @contextmenu=${(e) => e.preventDefault()}
      >
        <!-- Desktop view -->
        <div class="hidden lg:block">
          <div class="bg-black/30 text-white mb-4 p-2 rounded">
            <div class="flex justify-between mb-1">
              <span class="font-bold"
                >${translateText("control_panel.pop")}:</span
              >
              <span translate="no"
                >${renderTroops(this._population)} /
                ${renderTroops(this._maxPopulation)}
                <span
                  class="${
                    this._popRateIsIncreasing
                      ? "text-green-500"
                      : "text-yellow-500"
                  }
                  translate="no"
                  >(+${renderTroops(this.popRate)})</span
                ></span
              >
            </div>
            <div class="flex justify-between">
              <span class="font-bold"
                >${translateText("control_panel.gold")}:</span
              >
              <span translate="no"
                >${renderNumber(this._gold)}
                (+${renderNumber(this._goldPerSecond)})</span
              >
            </div>
          </div>
        </div>

        <!-- Mobile view stats (without integrated hotkey bar) -->
        <div class="block lg:hidden bg-black/30 text-white mb-4 p-2 rounded">
          <div class="flex justify-between mb-1">
            <span class="font-bold"
              >${translateText("control_panel.pop")}:</span
            >
            <span translate="no"
              >${renderTroops(this._population)} /
              ${renderTroops(this._maxPopulation)}
              <span
                class="${
                  this._popRateIsIncreasing
                    ? "text-green-500"
                    : "text-yellow-500"
                }
                translate="no"
                >(+${renderTroops(this.popRate)})</span
              ></span
            >
          </div>
          <div class="flex justify-between">
            <span class="font-bold"
              >${translateText("control_panel.gold")}:</span
            >
            <span translate="no"
              >${renderNumber(this._gold)}
              (+${renderNumber(this._goldPerSecond)})</span
            >
          </div>
        </div>

        <div class="relative mb-4 lg:mb-4">
          <label class="block text-white mb-1" translate="no"
            >${translateText("control_panel.troops")}:
            <span translate="no">${renderTroops(this._troops)}</span> |
            ${translateText("control_panel.workers")}:
            <span translate="no">${renderTroops(this._workers)}</span></label
          >
          <div class="relative h-8">
            <!-- Background track -->
            <div
              class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
            ></div>
            <!-- Fill track -->
            <div
              class="absolute left-0 top-3 h-2 bg-blue-500/60 rounded transition-all duration-300"
              style="width: ${this.currentTroopRatio * 100}%"
            ></div>
            <!-- Range input - exactly overlaying the visual elements -->
            <input
              type="range"
              min="1"
              max="100"
              .value=${(this.targetTroopRatio * 100).toString()}
              @input=${(e: Event) => {
                this.targetTroopRatio =
                  parseInt((e.target as HTMLInputElement).value) / 100;
                this.onTroopChange(this.targetTroopRatio);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer targetTroopRatio"
            />
          </div>
        </div>

        <div class="relative mb-0 lg:mb-4">
          <label class="block text-white mb-1" translate="no"
            >${translateText("control_panel.attack_ratio")}:
            ${(this.attackRatio * 100).toFixed(0)}%
            (${renderTroops(
              (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
            )})</label
          >
          <div class="relative h-8">
            <!-- Background track -->
            <div
              class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
            ></div>
            <!-- Fill track -->
            <div
              class="absolute left-0 top-3 h-2 bg-red-500/60 rounded transition-all duration-300"
              style="width: ${this.attackRatio * 100}%"
            ></div>
            <!-- Range input - exactly overlaying the visual elements -->
            <input
              id="attack-ratio"
              type="range"
              min="1"
              max="100"
              .value=${(this.attackRatio * 100).toString()}
              @input=${(e: Event) => {
                this.attackRatio =
                  parseInt((e.target as HTMLInputElement).value) / 100;
                this.onAttackRatioChange(this.attackRatio);
              }}
              class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer attackRatio"
            />
          </div>
        </div>

        <!-- Auto-play feature buttons -->
        <div class="relative mb-2 lg:mb-2">
          <div class="mb-2">
            <button
              @click=${this.toggleAutoPlay}
              class="w-full p-2 rounded text-white text-sm font-medium transition-colors ${this._autoPlayEnabled
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-gray-600 hover:bg-gray-500'}"
            >
              ${this._autoPlayEnabled
                ? '🤖 Auto-Play: ON'
                : '🎮 Auto-Play: OFF'}
            </button>
          </div>
          ${this._autoPlayEnabled ? html`
            <div class="flex gap-1">
              <button
                @click=${() => this.toggleAutoBuild()}
                class="flex-1 p-1 rounded text-white text-xs font-medium transition-colors ${this._autoBuild
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-gray-600 hover:bg-gray-500'}"
              >
                🔨 Build
              </button>
              <button
                @click=${() => this.toggleAutoShip()}
                class="flex-1 p-1 rounded text-white text-xs font-medium transition-colors ${this._autoShip
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-gray-600 hover:bg-gray-500'}"
              >
                🚀 Ship
              </button>
              <button
                @click=${() => this.toggleAutoAttack()}
                class="flex-1 p-1 rounded text-white text-xs font-medium transition-colors ${this._autoAttack
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-gray-600 hover:bg-gray-500'}"
              >
                ⚔️ Attack
              </button>
            </div>
          ` : ''}
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
