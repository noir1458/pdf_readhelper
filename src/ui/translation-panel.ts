import { errorMessage } from "../shared/errors";
import type { CachedPageTranslation } from "../translation/translation-cache";

export type TranslationPanelActions = {
  translate: (pageNumber: number, apiKey: string) => Promise<CachedPageTranslation>;
  reportError: (message: string) => void;
  openChanged: (open: boolean) => void;
};

export class TranslationPanel {
  readonly #root: HTMLElement;
  readonly #keyForm: HTMLFormElement;
  readonly #keyInput: HTMLInputElement;
  readonly #keySetup: HTMLElement;
  readonly #workspace: HTMLElement;
  readonly #pageLabel: HTMLElement;
  readonly #status: HTMLElement;
  readonly #output: HTMLElement;
  readonly #translateButton: HTMLButtonElement;
  readonly #copyButton: HTMLButtonElement;
  readonly #actions: TranslationPanelActions;
  #apiKey = "";
  #pageNumber = 1;
  #translation: CachedPageTranslation | null = null;
  #busy = false;

  constructor(root: HTMLElement, actions: TranslationPanelActions) {
    this.#root = root;
    this.#actions = actions;
    this.#keyForm = this.#require<HTMLFormElement>("#translation-key-form");
    this.#keyInput = this.#require<HTMLInputElement>("#translation-api-key");
    this.#keySetup = this.#require("#translation-key-setup");
    this.#workspace = this.#require("#translation-workspace");
    this.#pageLabel = this.#require("#translation-page-label");
    this.#status = this.#require("#translation-status");
    this.#output = this.#require("#translation-output");
    this.#translateButton = this.#require<HTMLButtonElement>("#translate-current-page");
    this.#copyButton = this.#require<HTMLButtonElement>("#copy-translation");

    this.#require<HTMLButtonElement>("#close-translation-panel").addEventListener("click", () =>
      this.close(),
    );
    this.#require<HTMLButtonElement>("#change-translation-key").addEventListener("click", () =>
      this.#clearKey(),
    );
    this.#keyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = this.#keyInput.value.trim();
      if (key.length < 20) {
        this.#actions.reportError("유효한 OpenAI API 키를 입력하세요.");
        return;
      }
      this.#apiKey = key;
      this.#keyInput.value = "";
      this.#showActiveView();
    });
    this.#translateButton.addEventListener("click", () => void this.#requestTranslation());
    this.#copyButton.addEventListener("click", () => void this.#copyTranslation());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.#root.hidden;
  }

  open(pageNumber: number): void {
    this.#pageNumber = pageNumber;
    this.#root.hidden = false;
    this.#showActiveView();
    this.#actions.openChanged(true);
    if (!this.#apiKey) this.#keyInput.focus();
  }

  close(): void {
    this.#root.hidden = true;
    this.#actions.openChanged(false);
  }

  showPage(pageNumber: number, translation: CachedPageTranslation | null): void {
    this.#pageNumber = pageNumber;
    this.#translation = translation;
    this.#showActiveView();
  }

  async #requestTranslation(): Promise<void> {
    if (this.#busy || !this.#apiKey) return;
    const requestedPage = this.#pageNumber;
    const previous = this.#translation;
    this.#busy = true;
    this.#translateButton.disabled = true;
    this.#translateButton.setAttribute("aria-busy", "true");
    this.#copyButton.disabled = true;
    this.#status.textContent = `페이지 ${requestedPage} 캡처 및 번역 중…`;
    this.#output.textContent = "이미지를 준비하고 OpenAI의 응답을 기다리고 있습니다.";
    try {
      const translation = await this.#actions.translate(requestedPage, this.#apiKey);
      if (this.#pageNumber === requestedPage) {
        this.#translation = translation;
        this.#renderTranslation();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (this.#pageNumber === requestedPage) {
          this.#translation = previous;
          this.#renderTranslation();
          this.#status.textContent = "번역 요청이 취소되었습니다.";
        }
        return;
      }
      const message = errorMessage(error);
      if (this.#pageNumber === requestedPage) {
        this.#translation = previous;
        this.#renderTranslation();
        this.#status.textContent = message;
      }
      this.#actions.reportError(message);
    } finally {
      this.#busy = false;
      this.#translateButton.disabled = false;
      this.#translateButton.removeAttribute("aria-busy");
      this.#copyButton.disabled = !this.#translation;
    }
  }

  async #copyTranslation(): Promise<void> {
    if (!this.#translation) return;
    try {
      await navigator.clipboard.writeText(this.#translation.text);
      this.#status.textContent = "번역을 클립보드에 복사했습니다.";
    } catch (error) {
      this.#actions.reportError(`번역을 복사하지 못했습니다: ${errorMessage(error)}`);
    }
  }

  #clearKey(): void {
    this.#apiKey = "";
    this.#keyInput.value = "";
    this.#keySetup.hidden = false;
    this.#workspace.hidden = true;
    this.#keyInput.focus();
  }

  #showActiveView(): void {
    const hasKey = Boolean(this.#apiKey);
    const canShowWorkspace = hasKey || Boolean(this.#translation);
    this.#keySetup.hidden = canShowWorkspace;
    this.#workspace.hidden = !canShowWorkspace;
    this.#translateButton.disabled = !hasKey || this.#busy;
    if (canShowWorkspace) this.#renderTranslation();
  }

  #renderTranslation(): void {
    this.#pageLabel.textContent = `페이지 ${this.#pageNumber}`;
    if (!this.#translation) {
      this.#status.textContent = "아직 번역하지 않은 페이지입니다.";
      this.#output.textContent = "번역 버튼을 누르면 현재 페이지 이미지만 OpenAI로 전송됩니다.";
      this.#translateButton.textContent = "이 페이지 번역";
      this.#copyButton.disabled = true;
      return;
    }

    this.#output.textContent = this.#translation.text;
    this.#translateButton.textContent = "다시 번역";
    this.#copyButton.disabled = false;
    const { inputTokens, outputTokens } = this.#translation.usage;
    const usage =
      inputTokens === undefined && outputTokens === undefined
        ? ""
        : ` · ${inputTokens ?? "?"} 입력 / ${outputTokens ?? "?"} 출력 토큰`;
    this.#status.textContent = `${this.#translation.model} · 캐시됨${usage}`;
  }

  #require<T extends Element = HTMLElement>(selector: string): T {
    const element = this.#root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing translation panel element: ${selector}`);
    return element;
  }
}
