import { parsePageRange, type PageRange } from "../shared/range";

export class RangePopover {
  readonly #element: HTMLElement;
  readonly #input: HTMLInputElement;
  readonly #form: HTMLFormElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #onSubmit: (range: PageRange) => Promise<void>;
  readonly #onClose: () => void;
  #totalPages = 0;

  constructor(
    element: HTMLElement,
    onSubmit: (range: PageRange) => Promise<void>,
    onClose: () => void,
  ) {
    this.#element = element;
    this.#input = this.#require<HTMLInputElement>("#range-input");
    this.#form = this.#require<HTMLFormElement>("#range-form");
    this.#closeButton = this.#require<HTMLButtonElement>("#close-range-popover");
    this.#onSubmit = onSubmit;
    this.#onClose = onClose;
    this.#form.addEventListener("submit", this.#submit);
    this.#closeButton.addEventListener("click", () => this.close());
    this.#element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
    document.addEventListener("pointerdown", (event) => {
      if (this.#element.hidden || !(event.target instanceof Node)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[aria-controls="range-popover"]')
      ) {
        return;
      }
      if (!this.#element.contains(event.target)) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.#element.hidden;
  }

  open(currentPage: number, totalPages: number): void {
    this.#totalPages = totalPages;
    this.#input.value = String(currentPage);
    this.#element.hidden = false;
    this.#input.focus();
    this.#input.select();
  }

  close(): void {
    this.#element.hidden = true;
    this.#onClose();
  }

  readonly #submit = (event: SubmitEvent): void => {
    event.preventDefault();
    let range: PageRange;
    try {
      range = parsePageRange(this.#input.value, this.#totalPages);
    } catch (error) {
      this.#input.setCustomValidity(error instanceof Error ? error.message : "Invalid page range.");
      this.#input.reportValidity();
      this.#input.setCustomValidity("");
      return;
    }
    void this.#onSubmit(range)
      .then(() => this.close())
      .catch(() => undefined);
  };

  #require<T extends Element>(selector: string): T {
    // Generic inference preserves input/form-specific properties.
    const element = this.#element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing range popover element: ${selector}`);
    return element;
  }
}
