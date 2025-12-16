import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";

const portraitKey: string = "portrait";

@customElement("portrait-input")
export class PortraitInput extends LitElement {
  @state() private portrait: string = "";
  @state() private search: string = "";
  @state() private showModal: boolean = false;

  private setPortrait(portrait: string) {
    console.log("PortraitInput - setPortrait called with:", portrait);
    this.portrait = portrait;
    this.storePortrait(portrait);
    this.dispatchPortraitEvent();
    console.log("PortraitInput - portrait set and stored");
  }

  public getCurrentPortrait(): string {
    return this.portrait;
  }

  private getStoredPortrait(): string {
    const storedPortrait = localStorage.getItem(portraitKey);
    if (storedPortrait) {
      return storedPortrait;
    }
    return "";
  }

  private storePortrait(portrait: string) {
    console.log("PortraitInput - storePortrait called with:", portrait);
    console.log("PortraitInput - portraitKey is:", portraitKey);
    if (portrait) {
      localStorage.setItem(portraitKey, portrait);
      console.log("PortraitInput - stored in localStorage:", localStorage.getItem(portraitKey));
    } else if (portrait === "") {
      localStorage.removeItem(portraitKey);
      console.log("PortraitInput - removed from localStorage");
    }
  }

  private dispatchPortraitEvent() {
    this.dispatchEvent(
      new CustomEvent("portrait-change", {
        detail: { portrait: this.portrait },
      }),
    );
  }

  connectedCallback() {
    super.connectedCallback();
    this.portrait = this.getStoredPortrait();
    console.log("PortraitInput - connectedCallback, loaded portrait:", this.portrait);
    this.dispatchPortraitEvent();
  }

  render() {
    return html`
      <div class="portrait-input">
        <button
          @click=${() => (this.showModal = !this.showModal)}
          class="border p-[8px] rounded-lg flex cursor-pointer border-black/30 dark:border-gray-300/60 bg-white/70 dark:bg-[rgba(55,65,81,0.7)] h-[50px]"
          title="Pick a portrait!"
        >
          <img
            class="size-[34px]"
            src="/Portraits/${this.portrait || "portrait_01"}.png"
            alt="Selected portrait"
          />
        </button>
        ${this.showModal
          ? html`
              <div
                class="portrait-modal"
                style="position: absolute; z-index: 10; background: rgba(30,30,30,0.95); border-radius: 10px; padding: 16px; top: 60px; left: 0; box-shadow: 0 2px 16px #0008; max-width: 350px;"
              >
                <div
                  class="portrait-list"
                  style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-height: 300px; overflow-y: auto;"
                >
                  ${Array.from({ length: 28 }, (_, i) => i + 1).map(
                    (i) => html`
                      <button
                        @click=${() => {
                          this.setPortrait(
                            `portrait_${String(i).padStart(2, "0")}`,
                          );
                          this.showModal = false;
                        }}
                        class="text-center cursor-pointer border-none bg-none opacity-90 hover:opacity-100 focus:opacity-100 focus:outline-none"
                        style="background: none; padding: 0; border-radius: 6px;"
                        title="Select portrait ${i}"
                      >
                        <img
                          class="portrait-image"
                          src="/Portraits/portrait_${String(i).padStart(
                            2,
                            "0",
                          )}.png"
                          alt="Portrait ${i}"
                          style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 2px solid #444; background: #222;"
                        />
                      </button>
                    `,
                  )}
                </div>
              </div>
            `
          : null}
      </div>
    `;
  }
}
