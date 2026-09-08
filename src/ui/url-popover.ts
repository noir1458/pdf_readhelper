export class UrlPopover {
  readonly #element: HTMLElement;
  readonly #trigger: HTMLButtonElement;
  readonly #input: HTMLInputElement;
  readonly #form: HTMLFormElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #onSubmit: (url: string) => Promise<void>;

  constructor(
    element: HTMLElement,
    trigger: HTMLButtonElement,
    onSubmit: (url: string) => Promise<void>,
  ) {
    this.#element = element;
    this.#trigger = trigger;
    this.#input = this.#require<HTMLInputElement>("#url-input");
    this.#form = this.#require<HTMLFormElement>("#url-form");
    this.#closeButton = this.#require<HTMLButtonElement>("#close-url-popover");
    this.#onSubmit = onSubmit;

    this.#trigger.addEventListener("click", () => {
      if (this.isOpen) this.close();
      else this.open();
    });
    this.#form.addEventListener("submit", this.#submit);
    this.#closeButton.addEventListener("click", () => this.close(true));
    this.#element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close(true);
    });
    document.addEventListener("pointerdown", (event) => {
      if (this.#element.hidden || !(event.target instanceof Node)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[aria-controls="url-popover"]')
      ) {
        return;
      }
      if (!this.#element.contains(event.target)) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.#element.hidden;
  }

  open(): void {
    this.#element.hidden = false;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#input.focus();
    this.#input.select();
  }

  close(restoreFocus = false): void {
    this.#element.hidden = true;
    this.#trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.#trigger.focus();
  }

  readonly #submit = (event: SubmitEvent): void => {
    event.preventDefault();
    const url = this.#input.value.trim();
    if (!url) return;
    void this.#onSubmit(url)
      .then(() => this.close())
      .catch(() => undefined);
  };

  #require<T extends Element>(selector: string): T {
    const element = this.#element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing URL popover element: ${selector}`);
    return element;
  }
}
