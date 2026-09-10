export type PageHistoryDirection = "back" | "forward";

const MAX_HISTORY_ENTRIES = 100;

export class PageNavigationHistory {
  #entries: number[] = [];
  #index = -1;

  get canGoBack(): boolean {
    return this.#index > 0;
  }

  get canGoForward(): boolean {
    return this.#index >= 0 && this.#index < this.#entries.length - 1;
  }

  clear(): void {
    this.#entries = [];
    this.#index = -1;
  }

  reset(pageNumber: number): void {
    this.#entries = [pageNumber];
    this.#index = 0;
  }

  record(currentPage: number, targetPage: number): void {
    if (currentPage === targetPage) return;
    if (this.#index < 0) this.reset(currentPage);
    else this.#entries[this.#index] = currentPage;

    this.#entries.splice(this.#index + 1);
    this.#entries.push(targetPage);
    this.#index += 1;
    this.#trimOldEntries();
  }

  move(direction: PageHistoryDirection, currentPage: number): number | null {
    const offset = direction === "back" ? -1 : 1;
    const targetIndex = this.#index + offset;
    if (targetIndex < 0 || targetIndex >= this.#entries.length) return null;
    this.#entries[this.#index] = currentPage;
    this.#index = targetIndex;
    return this.#entries[targetIndex] ?? null;
  }

  #trimOldEntries(): void {
    const overflow = this.#entries.length - MAX_HISTORY_ENTRIES;
    if (overflow <= 0) return;
    this.#entries.splice(0, overflow);
    this.#index -= overflow;
  }
}

export function pageHistoryShortcutDirection(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey"
  >,
): PageHistoryDirection | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return null;
  }
  if (event.key === "ArrowLeft") return "back";
  if (event.key === "ArrowRight") return "forward";
  return null;
}
