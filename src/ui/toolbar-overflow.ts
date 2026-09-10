export class ToolbarOverflow {
  readonly #root: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #menu: HTMLElement;
  readonly #onClose: () => void;

  constructor(root: HTMLElement, onClose: () => void = () => undefined) {
    this.#root = root;
    this.#button = this.#require<HTMLButtonElement>("#toolbar-more");
    this.#menu = this.#require<HTMLElement>("#toolbar-overflow-menu");
    this.#onClose = onClose;

    this.#button.addEventListener("click", () => this.toggle());
    this.#menu.addEventListener("click", (event) => this.#handleMenuClick(event));
    document.addEventListener("pointerdown", (event) => this.#handleOutsidePointer(event));
    document.addEventListener("keydown", (event) => this.#handleKeydown(event));
  }

  get isOpen(): boolean {
    return !this.#menu.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.#menu.hidden = false;
    this.#button.setAttribute("aria-expanded", "true");
  }

  close(restoreFocus = false): void {
    if (!this.isOpen) return;
    this.#menu.hidden = true;
    this.#button.setAttribute("aria-expanded", "false");
    this.#onClose();
    if (restoreFocus) this.#button.focus();
  }

  #handleMenuClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    if (
      button.id === "reading-theme" ||
      button.id === "search-pdf" ||
      button.closest(".theme-popover, .search-popover")
    ) {
      return;
    }
    this.close();
  }

  #handleOutsidePointer(event: PointerEvent): void {
    const target = event.target;
    if (!this.isOpen || !(target instanceof Node) || this.#root.contains(target)) return;
    this.close();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !this.isOpen) return;
    event.preventDefault();
    this.close(true);
  }

  #require<T extends Element>(selector: string): T {
    const element = this.#root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing toolbar overflow element: ${selector}`);
    return element;
  }
}
