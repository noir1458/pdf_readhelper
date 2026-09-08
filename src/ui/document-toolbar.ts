import type { PageRange } from "../shared/range";
import { RangePopover } from "./range-popover";

export type ToolbarActions = {
  copyPage: () => Promise<void>;
  extractRange: (range: PageRange) => Promise<void>;
};

export class DocumentToolbar {
  readonly #root: HTMLElement;
  readonly #copyButton: HTMLButtonElement;
  readonly #pdfButton: HTMLButtonElement;
  readonly #popover: RangePopover;
  #currentPage = 1;
  #totalPages = 0;

  constructor(root: HTMLElement, actions: ToolbarActions) {
    this.#root = root;
    this.#copyButton = this.#require("#copy-page");
    this.#pdfButton = this.#require("#extract-pdf");
    const popoverElement = this.#root.querySelector<HTMLElement>("#range-popover");
    if (!popoverElement) throw new Error("Missing range popover.");
    this.#popover = new RangePopover(
      popoverElement,
      (range) => this.#busy(this.#pdfButton, () => actions.extractRange(range)),
      () => this.#pdfButton.setAttribute("aria-expanded", "false"),
    );

    this.#copyButton.addEventListener(
      "click",
      () => void this.#busy(this.#copyButton, actions.copyPage),
    );
    this.#pdfButton.addEventListener("click", () => {
      if (this.#popover.isOpen) {
        this.#popover.close();
        return;
      }
      this.#popover.open(this.#currentPage, this.#totalPages);
      this.#pdfButton.setAttribute("aria-expanded", "true");
    });
  }

  show(totalPages: number): void {
    this.#totalPages = totalPages;
    this.#root.hidden = false;
  }

  setCurrentPage(pageNumber: number): void {
    this.#currentPage = pageNumber;
  }

  async #busy(button: HTMLButtonElement, operation: () => Promise<void>): Promise<void> {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await operation();
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  #require(selector: string): HTMLButtonElement {
    const element = this.#root.querySelector<HTMLButtonElement>(selector);
    if (!element) throw new Error(`Missing toolbar element: ${selector}`);
    return element;
  }
}
