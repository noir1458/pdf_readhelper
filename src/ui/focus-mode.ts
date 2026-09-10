export type FocusModeActions = {
  changed: (active: boolean) => void;
  fullscreenFailed: () => void;
};

export class FocusMode {
  readonly #root: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #document: Document;
  readonly #actions: FocusModeActions;
  #active = false;
  #requestSequence = 0;

  constructor(root: HTMLElement, button: HTMLButtonElement, actions: FocusModeActions) {
    this.#root = root;
    this.#button = button;
    this.#document = root.ownerDocument;
    this.#actions = actions;
    this.#button.addEventListener("click", this.#toggleFromButton);
    this.#document.addEventListener("fullscreenchange", this.#handleFullscreenChange);
    this.#apply();
  }

  get isActive(): boolean {
    return this.#active;
  }

  setAvailable(available: boolean): void {
    this.#button.disabled = !available;
  }

  async toggle(): Promise<void> {
    if (this.#active) await this.exit();
    else await this.enter();
  }

  async enter(): Promise<void> {
    if (this.#active) return;
    this.#active = true;
    this.#apply();
    this.#actions.changed(true);

    if (this.#document.fullscreenElement) return;
    const requestSequence = ++this.#requestSequence;
    try {
      await this.#document.documentElement.requestFullscreen({ navigationUI: "hide" });
      if (!this.#isCurrentRequest(requestSequence)) {
        await this.#leaveLateFullscreen();
      }
    } catch {
      if (this.#isCurrentRequest(requestSequence)) {
        this.#actions.fullscreenFailed();
      }
    }
  }

  async exit(): Promise<void> {
    if (!this.#active && !this.#document.fullscreenElement) return;
    this.#requestSequence += 1;
    this.#active = false;
    this.#apply();
    this.#actions.changed(false);
    if (!this.#document.fullscreenElement) return;
    try {
      await this.#document.exitFullscreen();
    } catch {
      // The reading chrome is restored even if the browser already left fullscreen.
    }
  }

  dispose(): void {
    this.#button.removeEventListener("click", this.#toggleFromButton);
    this.#document.removeEventListener("fullscreenchange", this.#handleFullscreenChange);
  }

  readonly #toggleFromButton = (): void => {
    void this.toggle();
  };

  readonly #handleFullscreenChange = (): void => {
    if (!this.#active || this.#document.fullscreenElement) return;
    this.#active = false;
    this.#apply();
    this.#actions.changed(false);
  };

  #apply(): void {
    if (this.#active) this.#root.dataset.focusMode = "true";
    else delete this.#root.dataset.focusMode;
    this.#button.setAttribute("aria-pressed", String(this.#active));
    const label = this.#active ? "Exit focus mode" : "Enter focus mode";
    this.#button.setAttribute("aria-label", label);
    this.#button.title = `${label} (F)`;
  }

  #isCurrentRequest(requestSequence: number): boolean {
    return requestSequence === this.#requestSequence && this.#active;
  }

  async #leaveLateFullscreen(): Promise<void> {
    if (!this.#document.fullscreenElement) return;
    try {
      await this.#document.exitFullscreen();
    } catch {
      // Chrome may already be completing the user's own fullscreen exit.
    }
  }
}
