export type ToastKind = "success" | "error" | "info";

export class Toast {
  readonly #element: HTMLElement;
  #timer = 0;

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  show(message: string, kind: ToastKind = "info", duration = 3600): void {
    window.clearTimeout(this.#timer);
    this.#element.textContent = message;
    this.#element.dataset.kind = kind;
    this.#element.hidden = false;
    this.#timer = window.setTimeout(() => {
      this.#element.hidden = true;
    }, duration);
  }
}
