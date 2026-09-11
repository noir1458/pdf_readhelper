export class KeyboardShortcutsPopover {
  readonly #element: HTMLElement;
  readonly #trigger: HTMLButtonElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #returnFocus: HTMLElement;

  constructor(element: HTMLElement, trigger: HTMLButtonElement, returnFocus: HTMLElement) {
    this.#element = element;
    this.#trigger = trigger;
    this.#returnFocus = returnFocus;
    this.#closeButton = this.#require<HTMLButtonElement>("#close-keyboard-shortcuts");

    this.#trigger.addEventListener("click", () => this.toggle());
    this.#closeButton.addEventListener("click", () => this.close(true));
    document.addEventListener("pointerdown", (event) => this.#handleOutsidePointer(event));
    document.addEventListener("keydown", (event) => this.#handleKeydown(event));
  }

  get isOpen(): boolean {
    return !this.#element.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.#element.hidden = false;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#closeButton.focus();
  }

  close(restoreFocus = false): void {
    if (!this.isOpen) return;
    this.#element.hidden = true;
    this.#trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.#returnFocus.focus();
  }

  #handleOutsidePointer(event: PointerEvent): void {
    const target = event.target;
    if (
      !this.isOpen ||
      !(target instanceof Node) ||
      this.#element.contains(target) ||
      this.#trigger.contains(target)
    ) {
      return;
    }
    this.close();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !this.isOpen) return;
    event.preventDefault();
    this.close(true);
  }

  #require<T extends Element>(selector: string): T {
    const element = this.#element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing keyboard shortcuts element: ${selector}`);
    return element;
  }
}
