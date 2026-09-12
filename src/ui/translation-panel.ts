import { errorMessage } from "../shared/errors";
import type { CachedPageTranslation } from "../translation/translation-cache";
import {
  DEFAULT_TRANSLATION_LANGUAGE,
  type TranslationProviderId,
  type TranslationProviderInfo,
} from "../translation/translation-provider";

type TranslationOverlayTheme = "clear" | "balanced" | "dark" | "opaque";
type TranslationPanelWidth = "wide" | "balanced" | "narrow";
type TranslationFontSize = "small" | "balanced" | "large";

export type TranslationPageResult = {
  pageNumber: number;
  translation: CachedPageTranslation | null;
};

const TARGET_LANGUAGE_PATTERN = /^[\p{L}\p{M}\p{N} ,()._-]{2,60}$/u;
const AUTO_TRANSLATION_DELAY_MS = 650;
const TRANSLATION_OVERLAY_THEMES: readonly TranslationOverlayTheme[] = [
  "clear",
  "balanced",
  "dark",
  "opaque",
];
const TRANSLATION_OVERLAY_THEME_UI: Record<
  TranslationOverlayTheme,
  { label: string; indicator: string }
> = {
  clear: { label: "Clear", indicator: "○" },
  balanced: { label: "Balanced", indicator: "◐" },
  dark: { label: "Dark", indicator: "●" },
  opaque: { label: "Opaque", indicator: "■" },
};
const TRANSLATION_PANEL_WIDTHS: readonly TranslationPanelWidth[] = ["balanced", "wide", "narrow"];
const TRANSLATION_PANEL_WIDTH_UI: Record<
  TranslationPanelWidth,
  { label: string; indicator: string; cssWidth: string }
> = {
  wide: { label: "Wide", indicator: "↔", cssWidth: "700px" },
  balanced: { label: "Default", indicator: "↔", cssWidth: "460px" },
  narrow: { label: "Narrow", indicator: "↔", cssWidth: "340px" },
};
const TRANSLATION_FONT_SIZES: readonly TranslationFontSize[] = ["balanced", "large", "small"];
const TRANSLATION_FONT_SIZE_UI: Record<TranslationFontSize, { label: string; indicator: string }> =
  {
    small: { label: "Small", indicator: "A−" },
    balanced: { label: "Default", indicator: "A" },
    large: { label: "Large", indicator: "A+" },
  };

/*
 * Target-language input remains editable so a huge language registry is unnecessary.
 * The datalist in viewer.html supplies common names/codes without limiting custom BCP 47 codes.
 */
function normalizedTargetLanguage(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  return TARGET_LANGUAGE_PATTERN.test(normalized) ? normalized : null;
}

export type TranslationPanelActions = {
  translate: (
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumber: number,
    apiKey: string,
  ) => Promise<CachedPageTranslation>;
  selectionChanged: (
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumbers: readonly number[],
  ) => void;
  openChanged: (open: boolean) => void;
  exportDocumentTranslations: () => Promise<number>;
  clearDocumentTranslations: () => Promise<number>;
};

export class TranslationPanel {
  readonly #root: HTMLElement;
  readonly #actions: TranslationPanelActions;
  readonly #providers: ReadonlyMap<TranslationProviderId, TranslationProviderInfo>;
  readonly #apiKeys = new Map<TranslationProviderId, string>();
  readonly #modelIds: Map<TranslationProviderId, string>;
  readonly #settingsPopover: HTMLElement;
  readonly #settingsButton: HTMLButtonElement;
  readonly #providerSelect: HTMLSelectElement;
  readonly #modelSelect: HTMLSelectElement;
  readonly #targetLanguageInput: HTMLInputElement;
  readonly #themeButton: HTMLButtonElement;
  readonly #themeIndicator: HTMLElement;
  readonly #widthButton: HTMLButtonElement;
  readonly #widthIndicator: HTMLElement;
  readonly #fontSizeButton: HTMLButtonElement;
  readonly #fontSizeIndicator: HTMLElement;
  readonly #autoButton: HTMLButtonElement;
  readonly #keyForm: HTMLFormElement;
  readonly #keyInput: HTMLInputElement;
  readonly #keyLabel: HTMLElement;
  readonly #keySubmit: HTMLButtonElement;
  readonly #keyDelete: HTMLButtonElement;
  readonly #keyState: HTMLElement;
  readonly #keyDescription: HTMLElement;
  readonly #apiKeyLink: HTMLAnchorElement;
  readonly #exportDocumentButton: HTMLButtonElement;
  readonly #clearDocumentButton: HTMLButtonElement;
  readonly #fileCacheState: HTMLElement;
  readonly #status: HTMLElement;
  readonly #errorBox: HTMLElement;
  readonly #errorText: HTMLElement;
  readonly #output: HTMLElement;
  readonly #resultActions: HTMLElement;
  readonly #translateButton: HTMLButtonElement;
  readonly #composerLabel: HTMLElement;
  readonly #copyButton: HTMLButtonElement;
  #providerId: TranslationProviderId;
  #targetLanguage = DEFAULT_TRANSLATION_LANGUAGE;
  #theme: TranslationOverlayTheme = "balanced";
  #panelWidth: TranslationPanelWidth = "balanced";
  #fontSize: TranslationFontSize = "balanced";
  #autoTranslate = false;
  #autoRequestPages: number[] = [];
  #autoRequestTimer = 0;
  #pageNumbers = [1];
  #translations = new Map<number, CachedPageTranslation>();
  #requestErrors = new Map<number, string>();
  #busyPages = new Set<number>();
  #busy = false;
  #fileActionBusy = false;

  constructor(
    root: HTMLElement,
    providers: readonly TranslationProviderInfo[],
    defaultProviderId: TranslationProviderId,
    actions: TranslationPanelActions,
  ) {
    this.#root = root;
    this.#actions = actions;
    this.#providers = new Map(providers.map((provider) => [provider.id, provider]));
    if (!this.#providers.has(defaultProviderId)) {
      throw new Error(`Missing default translation provider: ${defaultProviderId}`);
    }
    for (const provider of providers) {
      if (!provider.models.some(({ id }) => id === provider.defaultModelId)) {
        throw new Error(
          `Missing default ${provider.displayName} model: ${provider.defaultModelId}`,
        );
      }
    }

    this.#providerId = defaultProviderId;
    this.#modelIds = new Map(providers.map((provider) => [provider.id, provider.defaultModelId]));
    this.#settingsPopover = this.#require("#translation-settings-popover");
    this.#settingsButton = this.#require<HTMLButtonElement>("#open-translation-settings");
    this.#providerSelect = this.#require<HTMLSelectElement>("#translation-provider");
    this.#modelSelect = this.#require<HTMLSelectElement>("#translation-model");
    this.#targetLanguageInput = this.#require<HTMLInputElement>("#translation-target-language");
    this.#themeButton = this.#require<HTMLButtonElement>("#cycle-translation-theme");
    this.#themeIndicator = this.#require("#translation-theme-indicator");
    this.#widthButton = this.#require<HTMLButtonElement>("#cycle-translation-width");
    this.#widthIndicator = this.#require("#translation-width-indicator");
    this.#fontSizeButton = this.#require<HTMLButtonElement>("#cycle-translation-font-size");
    this.#fontSizeIndicator = this.#require("#translation-font-size-indicator");
    this.#autoButton = this.#require<HTMLButtonElement>("#toggle-translation-auto");
    this.#keyForm = this.#require<HTMLFormElement>("#translation-key-form");
    this.#keyInput = this.#require<HTMLInputElement>("#translation-api-key");
    this.#keyLabel = this.#require("#translation-api-key-label");
    this.#keySubmit = this.#require<HTMLButtonElement>("#translation-key-submit");
    this.#keyDelete = this.#require<HTMLButtonElement>("#delete-translation-key");
    this.#keyState = this.#require("#translation-key-state");
    this.#keyDescription = this.#require("#translation-key-description");
    this.#apiKeyLink = this.#require<HTMLAnchorElement>("#translation-api-key-link");
    this.#exportDocumentButton = this.#require<HTMLButtonElement>("#export-document-translations");
    this.#clearDocumentButton = this.#require<HTMLButtonElement>("#clear-document-translations");
    this.#fileCacheState = this.#require("#translation-file-cache-state");
    this.#status = this.#require("#translation-status");
    this.#errorBox = this.#require("#translation-error");
    this.#errorText = this.#require("#translation-error-message");
    this.#output = this.#require("#translation-output");
    this.#resultActions = this.#require("#translation-result-actions");
    this.#translateButton = this.#require<HTMLButtonElement>("#translate-current-page");
    this.#composerLabel = this.#require("#translation-composer-label");
    this.#copyButton = this.#require<HTMLButtonElement>("#copy-translation");

    this.#providerSelect.replaceChildren(
      ...providers.map((provider) => {
        const option = this.#root.ownerDocument.createElement("option");
        option.value = provider.id;
        option.textContent = provider.displayName;
        return option;
      }),
    );
    this.#providerSelect.addEventListener("change", () => {
      const provider = providers.find(({ id }) => id === this.#providerSelect.value);
      if (!provider) throw new Error(`Unknown translation provider: ${this.#providerSelect.value}`);
      this.#selectProvider(provider.id);
    });
    this.#modelSelect.addEventListener("change", () => this.#selectModel(this.#modelSelect.value));
    this.#targetLanguageInput.addEventListener("change", () => this.#selectTargetLanguage());
    this.#targetLanguageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.#selectTargetLanguage();
      }
    });
    this.#themeButton.addEventListener("click", () => this.#cycleTheme());
    this.#widthButton.addEventListener("click", () => this.#cyclePanelWidth());
    this.#fontSizeButton.addEventListener("click", () => this.#cycleFontSize());
    this.#autoButton.addEventListener("click", () => this.#toggleAutoTranslate());
    this.#settingsButton.addEventListener("click", () => this.#toggleSettings());
    this.#require<HTMLButtonElement>("#close-translation-settings").addEventListener("click", () =>
      this.#closeSettings(true),
    );
    this.#require<HTMLButtonElement>("#close-translation-panel").addEventListener("click", () =>
      this.close(),
    );
    this.#require<HTMLButtonElement>("#retry-translation").addEventListener(
      "click",
      () => void this.#requestTranslation(this.#retryPages()),
    );
    this.#require<HTMLButtonElement>("#error-translation-settings").addEventListener("click", () =>
      this.#openSettings(!this.#apiKeys.has(this.#providerId)),
    );
    this.#keyDelete.addEventListener("click", () => this.#clearKey());
    this.#keyForm.addEventListener("submit", (event) => this.#saveKey(event));
    this.#translateButton.addEventListener("click", () => this.requestVisiblePages());
    this.#copyButton.addEventListener("click", () => void this.#copyTranslation());
    this.#exportDocumentButton.addEventListener(
      "click",
      () => void this.#exportDocumentTranslations(),
    );
    this.#clearDocumentButton.addEventListener(
      "click",
      () => void this.#clearDocumentTranslations(),
    );
    document.addEventListener("pointerdown", (event) => this.#closeSettingsFromOutside(event));
    document.addEventListener("keydown", (event) => this.#handleEscape(event));

    this.#syncProviderUi();
    this.#render();
  }

  get isOpen(): boolean {
    return !this.#root.hidden;
  }

  get providerId(): TranslationProviderId {
    return this.#providerId;
  }

  get modelId(): string {
    return this.#model().id;
  }

  get targetLanguage(): string {
    return this.#targetLanguage;
  }

  get autoTranslateEnabled(): boolean {
    return this.#autoTranslate;
  }

  requestVisiblePages(): void {
    void this.#requestTranslation(
      this.#requestErrors.size > 0 ? this.#retryPages() : this.#pageNumbers,
    );
  }

  open(pageNumbers: readonly number[]): void {
    this.#setPageNumbers(pageNumbers);
    this.#root.hidden = false;
    this.#render();
    this.#actions.openChanged(true);
    if (!this.#apiKeys.has(this.#providerId)) this.#openSettings(true);
  }

  close(): void {
    this.#cancelPendingAutoRequest();
    this.#closeSettings(false);
    this.#root.hidden = true;
    this.#actions.openChanged(false);
  }

  showPages(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pages: readonly TranslationPageResult[],
    autoTranslateIfMissing = false,
  ): void {
    if (!this.#matchesSelection(providerId, modelId, targetLanguage)) return;
    this.#setFileCacheState("");
    this.#setPageNumbers(pages.map(({ pageNumber }) => pageNumber));
    this.#translations = new Map(
      pages.flatMap(({ pageNumber, translation }) =>
        translation ? ([[pageNumber, translation]] as const) : [],
      ),
    );
    this.#requestErrors.clear();
    this.#busyPages.clear();
    this.#render();
    const missingPages = autoTranslateIfMissing
      ? pages.filter(({ translation }) => !translation).map(({ pageNumber }) => pageNumber)
      : [];
    this.#scheduleAutoRequest(
      this.#autoTranslate && this.#apiKeys.has(this.#providerId) ? missingPages : [],
    );
  }

  showError(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumbers: readonly number[],
    message: string,
  ): void {
    if (!this.#matchesSelection(providerId, modelId, targetLanguage)) return;
    const visiblePages = pageNumbers.filter((pageNumber) => this.#pageNumbers.includes(pageNumber));
    if (visiblePages.length === 0) return;
    for (const pageNumber of visiblePages) this.#requestErrors.set(pageNumber, message);
    this.#render();
  }

  async #requestTranslation(pageNumbers: readonly number[]): Promise<void> {
    if (this.#busy) return;
    this.#cancelPendingAutoRequest();
    const requestedPages = [...new Set(pageNumbers)].filter((pageNumber) =>
      this.#pageNumbers.includes(pageNumber),
    );
    if (requestedPages.length === 0) return;
    const apiKey = this.#apiKeys.get(this.#providerId);
    if (!apiKey) {
      const message = `${this.#provider().displayName} API key required. Enter it in Settings.`;
      for (const pageNumber of requestedPages) this.#requestErrors.set(pageNumber, message);
      this.#render();
      this.#openSettings(true);
      return;
    }

    const requestedProviderId = this.#providerId;
    const requestedModelId = this.modelId;
    const requestedTargetLanguage = this.#targetLanguage;
    for (const pageNumber of requestedPages) this.#requestErrors.delete(pageNumber);
    this.#busyPages = new Set(requestedPages);
    this.#busy = true;
    this.#render();

    try {
      const results = await Promise.allSettled(
        requestedPages.map((pageNumber) =>
          this.#actions.translate(
            requestedProviderId,
            requestedModelId,
            requestedTargetLanguage,
            pageNumber,
            apiKey,
          ),
        ),
      );
      if (!this.#matchesSelection(requestedProviderId, requestedModelId, requestedTargetLanguage)) {
        return;
      }
      for (const [index, result] of results.entries()) {
        const pageNumber = requestedPages[index];
        if (pageNumber === undefined || !this.#pageNumbers.includes(pageNumber)) continue;
        if (result.status === "fulfilled") {
          this.#translations.set(pageNumber, result.value);
          this.#requestErrors.delete(pageNumber);
        } else if (!(result.reason instanceof Error && result.reason.name === "AbortError")) {
          this.#requestErrors.set(pageNumber, errorMessage(result.reason));
        }
      }
    } finally {
      this.#busy = false;
      this.#busyPages.clear();
      this.#render();
      this.#runPendingAutoRequest();
    }
  }

  async #copyTranslation(): Promise<void> {
    const translations = this.#pageNumbers.flatMap((pageNumber) => {
      const translation = this.#translations.get(pageNumber);
      return translation ? [{ pageNumber, text: translation.text }] : [];
    });
    if (translations.length === 0) return;
    const text =
      translations.length === 1
        ? (translations[0]?.text ?? "")
        : translations
            .map(({ pageNumber, text: translation }) => `Page ${pageNumber}\n${translation}`)
            .join("\n\n──────────\n\n");
    try {
      await navigator.clipboard.writeText(text);
      this.#status.textContent = "Translation copied to the clipboard.";
      this.#status.hidden = false;
    } catch (error) {
      this.#requestErrors.set(
        this.#pageNumbers[0] ?? 1,
        `Could not copy translation: ${errorMessage(error)}`,
      );
      this.#render();
    }
  }

  async #exportDocumentTranslations(): Promise<void> {
    this.#setFileActionBusy(true);
    this.#setFileCacheState("");
    try {
      const count = await this.#actions.exportDocumentTranslations();
      this.#setFileCacheState(
        `Exported translations from ${count} ${count === 1 ? "page" : "pages"}.`,
        "success",
      );
    } catch (error) {
      this.#setFileCacheState(errorMessage(error), "error");
    } finally {
      this.#setFileActionBusy(false);
    }
  }

  async #clearDocumentTranslations(): Promise<void> {
    const confirmed = window.confirm(
      "Delete every cached page translation for this PDF? This cannot be undone.",
    );
    if (!confirmed) return;
    this.#setFileActionBusy(true);
    this.#setFileCacheState("");
    try {
      const count = await this.#actions.clearDocumentTranslations();
      this.#translations.clear();
      this.#requestErrors.clear();
      this.#render();
      this.#setFileCacheState(
        count > 0
          ? `Deleted ${count} cached ${count === 1 ? "translation" : "translations"}.`
          : "No cached translations to delete.",
        "success",
      );
    } catch (error) {
      this.#setFileCacheState(errorMessage(error), "error");
    } finally {
      this.#setFileActionBusy(false);
    }
  }

  #setFileActionBusy(busy: boolean): void {
    this.#fileActionBusy = busy;
    this.#exportDocumentButton.disabled = busy || this.#busy;
    this.#clearDocumentButton.disabled = busy || this.#busy;
  }

  #setFileCacheState(message: string, kind: "success" | "error" = "success"): void {
    this.#fileCacheState.textContent = message;
    this.#fileCacheState.dataset.kind = kind;
    this.#fileCacheState.hidden = message.length === 0;
  }

  #saveKey(event: SubmitEvent): void {
    event.preventDefault();
    const key = this.#keyInput.value.trim();
    if (key.length < 20) {
      this.#keyState.dataset.kind = "error";
      this.#keyState.textContent = `Check the ${this.#provider().displayName} API key.`;
      this.#keyInput.focus();
      return;
    }
    this.#apiKeys.set(this.#providerId, key);
    this.#keyInput.value = "";
    this.#requestErrors.clear();
    this.#render();
    this.#closeSettings(true);
    this.#translateButton.focus();
  }

  #clearKey(): void {
    this.#cancelPendingAutoRequest();
    this.#apiKeys.delete(this.#providerId);
    this.#keyInput.value = "";
    this.#requestErrors.clear();
    this.#render();
    this.#keyInput.focus();
  }

  #selectProvider(providerId: TranslationProviderId): void {
    if (this.#busy || providerId === this.#providerId) return;
    this.#cancelPendingAutoRequest();
    this.#providerId = providerId;
    this.#translations.clear();
    this.#requestErrors.clear();
    this.#keyInput.value = "";
    this.#syncProviderUi();
    this.#render();
    this.#actions.selectionChanged(
      providerId,
      this.modelId,
      this.#targetLanguage,
      this.#pageNumbers,
    );
  }

  #selectModel(modelId: string): void {
    if (this.#busy || modelId === this.modelId) return;
    const provider = this.#provider();
    if (!provider.models.some(({ id }) => id === modelId)) {
      throw new Error(`Unknown ${provider.displayName} translation model: ${modelId}`);
    }
    this.#cancelPendingAutoRequest();
    this.#modelIds.set(provider.id, modelId);
    this.#translations.clear();
    this.#requestErrors.clear();
    this.#render();
    this.#actions.selectionChanged(provider.id, modelId, this.#targetLanguage, this.#pageNumbers);
  }

  #selectTargetLanguage(): void {
    if (this.#busy) return;
    const targetLanguage = normalizedTargetLanguage(this.#targetLanguageInput.value);
    if (!targetLanguage) {
      this.#targetLanguageInput.setCustomValidity(
        "Enter a language name or BCP 47 code using 2–60 characters.",
      );
      this.#targetLanguageInput.reportValidity();
      return;
    }
    this.#targetLanguageInput.setCustomValidity("");
    this.#targetLanguageInput.value = targetLanguage;
    if (targetLanguage === this.#targetLanguage) return;
    this.#cancelPendingAutoRequest();
    this.#targetLanguage = targetLanguage;
    this.#translations.clear();
    this.#requestErrors.clear();
    this.#render();
    this.#actions.selectionChanged(
      this.#providerId,
      this.modelId,
      targetLanguage,
      this.#pageNumbers,
    );
  }

  #cycleTheme(): void {
    const currentIndex = TRANSLATION_OVERLAY_THEMES.indexOf(this.#theme);
    this.#theme =
      TRANSLATION_OVERLAY_THEMES[(currentIndex + 1) % TRANSLATION_OVERLAY_THEMES.length] ??
      "balanced";
    this.#renderThemeButton();
  }

  #cyclePanelWidth(): void {
    const currentIndex = TRANSLATION_PANEL_WIDTHS.indexOf(this.#panelWidth);
    this.#panelWidth =
      TRANSLATION_PANEL_WIDTHS[(currentIndex + 1) % TRANSLATION_PANEL_WIDTHS.length] ?? "balanced";
    this.#renderWidthButton();
  }

  #cycleFontSize(): void {
    const currentIndex = TRANSLATION_FONT_SIZES.indexOf(this.#fontSize);
    this.#fontSize =
      TRANSLATION_FONT_SIZES[(currentIndex + 1) % TRANSLATION_FONT_SIZES.length] ?? "balanced";
    this.#renderFontSizeButton();
  }

  #toggleAutoTranslate(): void {
    this.#autoTranslate = !this.#autoTranslate;
    if (!this.#autoTranslate) this.#cancelPendingAutoRequest();
    this.#renderAutoButton();
  }

  #render(): void {
    const provider = this.#provider();
    const hasKey = this.#apiKeys.has(provider.id);
    const hasTranslation = this.#pageNumbers.some((pageNumber) =>
      this.#translations.has(pageNumber),
    );
    const errors = this.#pageNumbers.flatMap((pageNumber) => {
      const message = this.#requestErrors.get(pageNumber);
      return message ? [`Page ${pageNumber}: ${message}`] : [];
    });
    const state = this.#busy
      ? "busy"
      : errors.length > 0
        ? "error"
        : hasTranslation
          ? "result"
          : "empty";
    this.#root.dataset.translationState = state;
    this.#root.dataset.translationTheme = this.#theme;
    this.#renderThemeButton();
    this.#renderWidthButton();
    this.#renderFontSizeButton();
    this.#renderAutoButton();
    this.#translateButton.disabled = this.#busy;
    this.#settingsButton.disabled = this.#busy;
    this.#providerSelect.disabled = this.#busy;
    this.#modelSelect.disabled = this.#busy;
    this.#targetLanguageInput.disabled = this.#busy;
    this.#keyInput.disabled = this.#busy;
    this.#keySubmit.disabled = this.#busy;
    this.#keyDelete.disabled = this.#busy || !hasKey;
    this.#exportDocumentButton.disabled = this.#busy || this.#fileActionBusy;
    this.#clearDocumentButton.disabled = this.#busy || this.#fileActionBusy;
    this.#keyDelete.hidden = !hasKey;
    this.#keyState.dataset.kind = "ready";
    this.#keyState.textContent = hasKey
      ? `${provider.displayName} key ready · cleared when this tab closes.`
      : `No ${provider.displayName} key in this tab.`;

    this.#status.hidden = true;
    this.#errorBox.hidden = errors.length === 0;
    this.#errorText.textContent = errors.join("\n");
    this.#resultActions.hidden = !hasTranslation;
    this.#copyButton.disabled = !hasTranslation || this.#busy;
    this.#renderPageResults();

    if (this.#busy) {
      this.#composerLabel.textContent =
        this.#busyPages.size > 1 ? `Translating ${this.#busyPages.size} pages…` : "Translating…";
      return;
    }
    if (errors.length > 0) {
      this.#composerLabel.textContent = "Retry failed pages";
      return;
    }
    const allTranslated = this.#pageNumbers.every((pageNumber) =>
      this.#translations.has(pageNumber),
    );
    const pageLabel = this.#pageNumbers.length > 1 ? `${this.#pageNumbers.length} pages` : "page";
    if (allTranslated) {
      this.#composerLabel.textContent = `Translate current ${pageLabel} again`;
      return;
    }
    this.#composerLabel.textContent = hasKey
      ? `Translate current ${pageLabel}`
      : "Set API key to translate";
  }

  #renderPageResults(): void {
    const nodes: HTMLElement[] = [];
    for (const [index, pageNumber] of this.#pageNumbers.entries()) {
      if (index > 0) {
        const divider = this.#root.ownerDocument.createElement("hr");
        divider.className = "translation-page-divider";
        nodes.push(divider);
      }
      const section = this.#root.ownerDocument.createElement("section");
      section.className = "translation-page-result";
      const translation = this.#translations.get(pageNumber);
      const meta = this.#root.ownerDocument.createElement("p");
      meta.className = "translation-page-meta";
      meta.textContent = translation
        ? this.#resultSummary(pageNumber, translation)
        : `Page ${pageNumber}`;
      const text = this.#root.ownerDocument.createElement("div");
      text.className = "translation-page-text";
      if (this.#busyPages.has(pageNumber)) {
        text.classList.add("is-status");
        text.textContent = "Reading the page image and translating…";
      } else if (translation) {
        text.textContent = translation.text;
      } else if (this.#requestErrors.has(pageNumber)) {
        text.classList.add("is-status");
        text.textContent = "Translation failed.";
      } else {
        text.classList.add("is-status");
        text.textContent = "No saved translation.";
      }
      section.append(meta, text);
      nodes.push(section);
    }
    this.#output.replaceChildren(...nodes);
  }

  #resultSummary(pageNumber: number, translation: CachedPageTranslation): string {
    const provider = this.#providers.get(translation.providerId);
    const model = provider?.models.find(({ id }) => id === translation.model);
    const source = `${provider?.displayName ?? translation.providerId} · ${model?.displayName ?? translation.model} · ${translation.targetLanguage}`;
    const { inputTokens, outputTokens } = translation.usage;
    const usage =
      inputTokens === undefined && outputTokens === undefined
        ? ""
        : ` · ${inputTokens ?? "?"} input / ${outputTokens ?? "?"} output tokens`;
    return `Page ${pageNumber} · ${source} · cached${usage}`;
  }

  #syncProviderUi(): void {
    const provider = this.#provider();
    this.#providerSelect.value = provider.id;
    this.#modelSelect.replaceChildren(
      ...provider.models.map((model) => {
        const option = this.#root.ownerDocument.createElement("option");
        option.value = model.id;
        option.textContent = model.displayName;
        return option;
      }),
    );
    this.#modelSelect.value = this.modelId;
    this.#targetLanguageInput.value = this.#targetLanguage;
    this.#keyLabel.textContent = `${provider.displayName} API key`;
    this.#apiKeyLink.href = provider.apiKeyUrl;
    this.#apiKeyLink.textContent = `Get ${provider.displayName} API key ↗`;
    this.#keyInput.placeholder = provider.apiKeyPlaceholder;
    this.#keyDescription.textContent =
      `The key stays only in this viewer tab's memory and is never saved. ` +
      `When you translate, the visible page image and translation instructions are sent to ${provider.displayName}.`;
  }

  #renderThemeButton(): void {
    const theme = TRANSLATION_OVERLAY_THEME_UI[this.#theme];
    const nextTheme =
      TRANSLATION_OVERLAY_THEMES[
        (TRANSLATION_OVERLAY_THEMES.indexOf(this.#theme) + 1) % TRANSLATION_OVERLAY_THEMES.length
      ] ?? "balanced";
    const next = TRANSLATION_OVERLAY_THEME_UI[nextTheme];
    const label = `Translation background: ${theme.label} · click for ${next.label}`;
    this.#root.dataset.translationTheme = this.#theme;
    this.#themeButton.dataset.translationTheme = this.#theme;
    this.#themeButton.setAttribute("aria-label", label);
    this.#themeButton.title = label;
    this.#themeIndicator.textContent = theme.indicator;
  }

  #renderWidthButton(): void {
    const width = TRANSLATION_PANEL_WIDTH_UI[this.#panelWidth];
    const nextWidth =
      TRANSLATION_PANEL_WIDTHS[
        (TRANSLATION_PANEL_WIDTHS.indexOf(this.#panelWidth) + 1) % TRANSLATION_PANEL_WIDTHS.length
      ] ?? "balanced";
    const next = TRANSLATION_PANEL_WIDTH_UI[nextWidth];
    const label = `Translation panel width: ${width.label} · click for ${next.label}`;
    this.#root.dataset.translationWidth = this.#panelWidth;
    this.#root.style.width = `min(100vw, ${width.cssWidth})`;
    this.#widthButton.dataset.translationWidth = this.#panelWidth;
    this.#widthButton.setAttribute("aria-label", label);
    this.#widthButton.title = label;
    this.#widthIndicator.textContent = width.indicator;
  }

  #renderFontSizeButton(): void {
    const fontSize = TRANSLATION_FONT_SIZE_UI[this.#fontSize];
    const nextFontSize =
      TRANSLATION_FONT_SIZES[
        (TRANSLATION_FONT_SIZES.indexOf(this.#fontSize) + 1) % TRANSLATION_FONT_SIZES.length
      ] ?? "balanced";
    const next = TRANSLATION_FONT_SIZE_UI[nextFontSize];
    const label = `Translation font size: ${fontSize.label} · click for ${next.label}`;
    this.#root.dataset.translationFontSize = this.#fontSize;
    this.#fontSizeButton.dataset.translationFontSize = this.#fontSize;
    this.#fontSizeButton.setAttribute("aria-label", label);
    this.#fontSizeButton.title = label;
    this.#fontSizeIndicator.textContent = fontSize.indicator;
  }

  #renderAutoButton(): void {
    this.#autoButton.setAttribute("aria-pressed", String(this.#autoTranslate));
    this.#autoButton.setAttribute(
      "aria-label",
      this.#autoTranslate ? "Turn off automatic translation" : "Turn on automatic translation",
    );
  }

  #runPendingAutoRequest(): void {
    if (
      this.#autoRequestPages.length === 0 ||
      this.#autoRequestTimer !== 0 ||
      this.#busy ||
      !this.isOpen
    ) {
      return;
    }
    const pageNumbers = [...this.#autoRequestPages];
    this.#autoRequestPages = [];
    void this.#requestTranslation(pageNumbers);
  }

  #scheduleAutoRequest(pageNumbers: readonly number[]): void {
    this.#cancelPendingAutoRequest();
    if (pageNumbers.length === 0) return;
    this.#autoRequestPages = [...pageNumbers];
    this.#autoRequestTimer = window.setTimeout(() => {
      this.#autoRequestTimer = 0;
      this.#runPendingAutoRequest();
    }, AUTO_TRANSLATION_DELAY_MS);
  }

  #cancelPendingAutoRequest(): void {
    window.clearTimeout(this.#autoRequestTimer);
    this.#autoRequestTimer = 0;
    this.#autoRequestPages = [];
  }

  #retryPages(): number[] {
    const failed = this.#pageNumbers.filter((pageNumber) => this.#requestErrors.has(pageNumber));
    return failed.length > 0 ? failed : [...this.#pageNumbers];
  }

  #setPageNumbers(pageNumbers: readonly number[]): void {
    const normalized = [...new Set(pageNumbers)].filter(
      (pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0,
    );
    this.#pageNumbers = normalized.length > 0 ? normalized : [1];
  }

  #toggleSettings(): void {
    if (this.#settingsPopover.hidden) this.#openSettings(false);
    else this.#closeSettings(true);
  }

  #openSettings(focusKey: boolean): void {
    if (this.#busy) return;
    this.#settingsPopover.hidden = false;
    this.#settingsButton.setAttribute("aria-expanded", "true");
    this.#render();
    if (focusKey) this.#keyInput.focus();
    else this.#providerSelect.focus();
  }

  #closeSettings(restoreFocus: boolean): void {
    if (this.#settingsPopover.hidden) return;
    this.#settingsPopover.hidden = true;
    this.#settingsButton.setAttribute("aria-expanded", "false");
    if (restoreFocus && this.isOpen) this.#settingsButton.focus();
  }

  #closeSettingsFromOutside(event: PointerEvent): void {
    if (this.#settingsPopover.hidden || !(event.target instanceof Node)) return;
    if (
      this.#settingsPopover.contains(event.target) ||
      this.#settingsButton.contains(event.target)
    ) {
      return;
    }
    this.#closeSettings(false);
  }

  #handleEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !this.isOpen) return;
    if (!this.#settingsPopover.hidden) {
      event.preventDefault();
      this.#closeSettings(true);
      return;
    }
    this.close();
  }

  #matchesSelection(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
  ): boolean {
    return (
      this.#providerId === providerId &&
      this.modelId === modelId &&
      this.#targetLanguage === targetLanguage
    );
  }

  #provider(): TranslationProviderInfo {
    const provider = this.#providers.get(this.#providerId);
    if (!provider) throw new Error(`Missing translation provider: ${this.#providerId}`);
    return provider;
  }

  #model(): TranslationProviderInfo["models"][number] {
    const provider = this.#provider();
    const modelId = this.#modelIds.get(provider.id);
    const model = provider.models.find(({ id }) => id === modelId);
    if (!model) throw new Error(`Missing ${provider.displayName} translation model: ${modelId}`);
    return model;
  }

  #require<T extends Element = HTMLElement>(selector: string): T {
    const element = this.#root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing translation panel element: ${selector}`);
    return element;
  }
}
