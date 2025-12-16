import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
const flagKey: string = "flag";

const portraitNames = [
  "Stellar Captain",
  "Void Walker",
  "Star Commander",
  "Cosmic Wanderer",
  "Nova Knight",
  "Eclipse Lord",
  "Nebula Queen",
  "Solar Sentinel",
  "Astral Warrior",
  "Galactic Chief",
  "Space Admiral",
  "Meteor Hunter",
  "Comet Chaser",
  "Pulsar Knight",
  "Quasar King",
  "Cosmic Ruler",
  "Star Sovereign",
  "Galaxy Guardian",
  "Void Voyager",
  "Nebula Navigator",
  "Solar Seeker",
  "Stellar Scout",
  "Cosmic Captain",
  "Space Sovereign",
  "Star Stalker",
  "Nova Navigator",
  "Void Vanguard",
  "Astral Admiral",
];

@customElement("avatar-input")
export class FlagInput extends LitElement {
  @state() private flag: string = "portrait_26";
  @state() private showModal: boolean = false;

  static styles = css`
    .portrait-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .portrait-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 0.5rem;
      transition: all 0.2s;
      background: rgba(255, 255, 255, 0.05);
    }

    .portrait-item:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .portrait-item:hover .portrait-image {
      filter: brightness(1.2);
      transform: scale(1.05);
    }

    .portrait-image {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 0.25rem;
      transition: all 0.2s;
    }

    .selected-portrait {
      width: 42px;
      height: 42px;
      object-fit: cover;
      border-radius: 0.375rem;
    }

    .portrait-name {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.8);
      text-align: center;
      max-width: 80px;
      line-height: 1.1;
      transition: all 0.2s;
    }

    .portrait-item:hover .portrait-name {
      color: rgba(255, 255, 255, 1);
    }

    .modal-container {
      position: fixed;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 600px;
      background: rgba(17, 24, 39, 0.95);
      backdrop-filter: blur(8px);
      border-radius: 0.5rem;
      padding: 0.75rem;
      z-index: 50;
      box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    .select-button {
      height: 50px;
      display: flex;
      align-items: center;
      padding: 4px;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: all 0.2s;
    }

    .select-button:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      z-index: 40;
    }

    @media (max-width: 768px) {
      .portrait-grid {
        grid-template-columns: repeat(4, 1fr);
      }

      .portrait-image {
        width: 40px;
        height: 40px;
      }

      .selected-portrait {
        width: 38px;
        height: 38px;
      }

      .select-button {
        height: 46px;
      }

      .modal-container {
        width: 320px;
      }
    }
  `;

  private setFlag(flag: string) {
    if (!flag.startsWith("portrait_")) {
      flag = "portrait_" + flag;
    }
    this.flag = flag;
    this.storeFlag(flag);
    this.dispatchFlagEvent();
    this.showModal = false;
  }

  public getCurrentFlag(): string {
    return this.flag.replace("portrait_", "");
  }

  private getStoredFlag(): string {
    const storedFlag = localStorage.getItem(flagKey);
    if (storedFlag) {
      return storedFlag.startsWith("portrait_")
        ? storedFlag
        : `portrait_${storedFlag}`;
    }
    return "portrait_26";
  }

  private storeFlag(flag: string) {
    if (flag) {
      const flagToStore = flag.startsWith("portrait_")
        ? flag
        : `portrait_${flag}`;
      localStorage.setItem(flagKey, flagToStore);
    } else {
      localStorage.removeItem(flagKey);
    }
  }

  private dispatchFlagEvent() {
    this.dispatchEvent(
      new CustomEvent("flag-change", {
        detail: { flag: this.getCurrentFlag() },
      }),
    );
  }

  connectedCallback() {
    super.connectedCallback();
    const storedFlag = this.getStoredFlag();
    this.flag = storedFlag;
    this.dispatchFlagEvent();
  }

  render() {
    return html`
      ${this.showModal
        ? html`<div
            class="modal-backdrop"
            @click=${() => (this.showModal = false)}
          ></div>`
        : ""}
      <div class="flex relative">
        <button
          @click=${() => (this.showModal = !this.showModal)}
          class="select-button"
          title="Pick a portrait!"
        >
          <img class="selected-portrait" src="/Portraits/${this.flag}.png" />
        </button>
        ${this.showModal
          ? html`
              <div class="modal-container">
                <div class="portrait-grid">
                  ${Array.from({ length: 28 }, (_, i) => i + 1).map(
                    (i) => html`
                      <button
                        @click=${() =>
                          this.setFlag(
                            `portrait_${String(i).padStart(2, "0")}`,
                          )}
                        class="portrait-item"
                      >
                        <img
                          class="portrait-image"
                          src="/Portraits/portrait_${String(i).padStart(
                            2,
                            "0",
                          )}.png"
                        />
                        <span class="portrait-name"
                          >${portraitNames[i - 1]}</span
                        >
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}
      </div>
    `;
  }
}
