export const READING_THEME_STORAGE_KEY = "pdf-read-helper-reading-theme";
export const READING_THEMES = ["original", "sepia", "dark"] as const;

export type ReadingTheme = (typeof READING_THEMES)[number];

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeReadingTheme(value: unknown): ReadingTheme {
  return typeof value === "string" && READING_THEMES.includes(value as ReadingTheme)
    ? (value as ReadingTheme)
    : "original";
}

export function readReadingTheme(storage: Pick<ThemeStorage, "getItem"> | null): ReadingTheme {
  if (!storage) return "original";
  try {
    return normalizeReadingTheme(storage.getItem(READING_THEME_STORAGE_KEY));
  } catch {
    return "original";
  }
}

export class ReadingThemePicker {
  readonly #element: HTMLElement;
  readonly #trigger: HTMLButtonElement;
  readonly #options: HTMLButtonElement[];
  readonly #storage: ThemeStorage | null;
  readonly #onChange: (theme: ReadingTheme) => void;
  #theme: ReadingTheme;

  constructor(
    element: HTMLElement,
    trigger: HTMLButtonElement,
    onChange: (theme: ReadingTheme) => void,
    storage: ThemeStorage | null = browserStorage(),
  ) {
    this.#element = element;
    this.#trigger = trigger;
    this.#onChange = onChange;
    this.#storage = storage;
    this.#options = [...this.#element.querySelectorAll<HTMLButtonElement>("[data-theme-value]")];
    if (this.#options.length !== READING_THEMES.length) {
      throw new Error("Missing reading theme options.");
    }
    this.#theme = readReadingTheme(storage);

    this.#trigger.addEventListener("click", () => {
      if (this.isOpen) this.close();
      else this.open();
    });
    this.#require<HTMLButtonElement>("#close-theme-popover").addEventListener("click", () =>
      this.close(true),
    );
    for (const option of this.#options) {
      option.addEventListener("click", () => {
        this.setTheme(normalizeReadingTheme(option.dataset.themeValue));
        this.close(true);
      });
    }
    this.#element.addEventListener("keydown", this.#handleKeydown);
    document.addEventListener("pointerdown", this.#handleOutsidePointer);
    this.#apply(false);
  }

  get isOpen(): boolean {
    return !this.#element.hidden;
  }

  get theme(): ReadingTheme {
    return this.#theme;
  }

  open(): void {
    this.#element.hidden = false;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#options.find((option) => option.dataset.themeValue === this.#theme)?.focus();
  }

  close(restoreFocus = false): void {
    this.#element.hidden = true;
    this.#trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.#trigger.focus();
  }

  setTheme(theme: ReadingTheme): void {
    if (theme === this.#theme) return;
    this.#theme = theme;
    this.#apply(true);
  }

  readonly #handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = this.#options.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const nextIndex =
      (Math.max(0, currentIndex) + direction + this.#options.length) % this.#options.length;
    const nextOption = this.#options[nextIndex];
    if (!nextOption) return;
    this.setTheme(normalizeReadingTheme(nextOption.dataset.themeValue));
    nextOption.focus();
  };

  readonly #handleOutsidePointer = (event: PointerEvent): void => {
    if (this.#element.hidden || !(event.target instanceof Node)) return;
    if (
      event.target instanceof Element &&
      event.target.closest('[aria-controls="theme-popover"]')
    ) {
      return;
    }
    if (!this.#element.contains(event.target)) this.close();
  };

  #apply(persist: boolean): void {
    for (const option of this.#options) {
      const selected = option.dataset.themeValue === this.#theme;
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
    this.#trigger.classList.toggle("is-active", this.#theme !== "original");
    this.#trigger.title = `Reading theme: ${themeLabel(this.#theme)}`;
    this.#trigger.setAttribute("aria-label", `Reading theme: ${themeLabel(this.#theme)}`);
    this.#onChange(this.#theme);
    if (!persist || !this.#storage) return;
    try {
      this.#storage.setItem(READING_THEME_STORAGE_KEY, this.#theme);
    } catch {
      // Theme persistence is optional; the active viewer theme still works.
    }
  }

  #require<T extends Element>(selector: string): T {
    const element = this.#element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing reading theme element: ${selector}`);
    return element;
  }
}

function browserStorage(): ThemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function themeLabel(theme: ReadingTheme): string {
  if (theme === "sepia") return "Sepia";
  if (theme === "dark") return "Dark";
  return "Original";
}
