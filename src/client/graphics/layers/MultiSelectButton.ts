import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus, GameEvent } from "../../../core/EventBus";
import { Layer } from "./Layer";

export class MultiSelectModeEvent implements GameEvent {
  constructor(public readonly enabled: boolean) {}
}

@customElement("multi-select-button")
export class MultiSelectButton extends LitElement implements Layer {
  public eventBus: EventBus;

  @state()
  private multiSelectEnabled = false;

  @state()
  private isVisible = false;

  static styles = css`
    :host {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1000;
      display: none;
    }

    :host([visible]) {
      display: block;
    }

    .multi-select-btn {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #666;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      transition: all 0.3s ease;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .multi-select-btn:hover {
      background: rgba(0, 0, 0, 0.8);
      border-color: #888;
      transform: scale(1.1);
    }

    .multi-select-btn.active {
      background: rgba(0, 100, 255, 0.7);
      border-color: #00a0ff;
      animation: pulse 1.5s infinite;
    }

    .multi-select-btn.active:hover {
      background: rgba(0, 120, 255, 0.8);
      border-color: #20b0ff;
    }

    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(0, 160, 255, 0.7);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(0, 160, 255, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(0, 160, 255, 0);
      }
    }

    .tooltip {
      position: absolute;
      right: 60px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .multi-select-btn:hover + .tooltip {
      opacity: 1;
    }
  `;

  init() {
    this.setVisible(true);

    // Listen for multi-select mode changes from other sources
    this.eventBus.on(MultiSelectModeEvent, (event) => {
      if (event.enabled !== this.multiSelectEnabled) {
        this.multiSelectEnabled = event.enabled;
        this.requestUpdate();
      }
    });
  }

  tick() {
    // No tick logic needed for this button
  }

  render() {
    return html`
      <button
        class="multi-select-btn ${this.multiSelectEnabled ? 'active' : ''}"
        @click=${this.toggleMultiSelect}
        title="${this.multiSelectEnabled ? 'Disable' : 'Enable'} Multi-Select"
      >
        ${this.multiSelectEnabled ? '⊞' : '⊡'}
      </button>
      <div class="tooltip">
        ${this.multiSelectEnabled
          ? 'Multi-Select Mode: Drag to select multiple warships'
          : 'Click to enable Multi-Select Mode'}
      </div>
    `;
  }

  private toggleMultiSelect() {
    this.multiSelectEnabled = !this.multiSelectEnabled;
    this.eventBus.emit(new MultiSelectModeEvent(this.multiSelectEnabled));
  }

  setVisible(visible: boolean) {
    this.isVisible = visible;
    if (visible) {
      this.setAttribute('visible', '');
    } else {
      this.removeAttribute('visible');
    }
  }

  // Called when game ends or player dies
  hide() {
    this.setVisible(false);
    this.multiSelectEnabled = false;
  }
}