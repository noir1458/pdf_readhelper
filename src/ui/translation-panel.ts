import { errorMessage } from "../shared/errors";
import type { CachedPageTranslation } from "../translation/translation-cache";
import {
  DEFAULT_TRANSLATION_LANGUAGE,
  type TranslationProviderId,
  type TranslationProviderInfo,
} from "../translation/translation-provider";

type TranslationOverlayTheme = "clear" | "balanced" | "dark";

const TARGET_LANGUAGE_PATTERN = /^[\p{L}\p{M}\p{N} ,()._-]{2,60}$/u;
const AUTO_TRANSLATION_DELAY_MS = 650;
const TRANSLATION_OVERLAY_THEMES: readonly TranslationOverlayTheme[] = [
  "clear",
  "balanced",
  "dark",
];
const TRANSLATION_OVERLAY_THEME_UI: Record<
  TranslationOverlayTheme,
  { label: string; indicator: string }
> = {
  clear: { label: "투명", indicator: "○" },
  balanced: { label: "균형", indicator: "◐" },
  dark: { label: "진하게", indicator: "●" },
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
    pageNumber: number,
  ) => void;
  openChanged: (open: boolean) => void;
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
  readonly #autoButton: HTMLButtonElement;
  readonly #keyForm: HTMLFormElement;
  readonly #keyInput: HTMLInputElement;
  readonly #keyLabel: HTMLElement;
  readonly #keySubmit: HTMLButtonElement;
  readonly #keyDelete: HTMLButtonElement;
  readonly #keyState: HTMLElement;
  readonly #resultState: HTMLElement;
  readonly #keyDescription: HTMLElement;
  readonly #apiKeyLink: HTMLAnchorElement;
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
  #autoTranslate = false;
  #autoRequestPending = false;
  #autoRequestTimer = 0;
  #pageNumber = 1;
  #translation: CachedPageTranslation | null = null;
  #requestError: string | null = null;
  #busy = false;

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
    this.#autoButton = this.#require<HTMLButtonElement>("#toggle-translation-auto");
    this.#keyForm = this.#require<HTMLFormElement>("#translation-key-form");
    this.#keyInput = this.#require<HTMLInputElement>("#translation-api-key");
    this.#keyLabel = this.#require("#translation-api-key-label");
    this.#keySubmit = this.#require<HTMLButtonElement>("#translation-key-submit");
    this.#keyDelete = this.#require<HTMLButtonElement>("#delete-translation-key");
    this.#keyState = this.#require("#translation-key-state");
    this.#resultState = this.#require("#translation-result-state");
    this.#keyDescription = this.#require("#translation-key-description");
    this.#apiKeyLink = this.#require<HTMLAnchorElement>("#translation-api-key-link");
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
      () => void this.#requestTranslation(),
    );
    this.#require<HTMLButtonElement>("#error-translation-settings").addEventListener("click", () =>
      this.#openSettings(!this.#apiKeys.has(this.#providerId)),
    );
    this.#keyDelete.addEventListener("click", () => this.#clearKey());
    this.#keyForm.addEventListener("submit", (event) => this.#saveKey(event));
    this.#translateButton.addEventListener("click", () => void this.#requestTranslation());
    this.#copyButton.addEventListener("click", () => void this.#copyTranslation());
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

  open(pageNumber: number): void {
    this.#pageNumber = pageNumber;
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

  showPage(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumber: number,
    translation: CachedPageTranslation | null,
    autoTranslateIfMissing = false,
  ): void {
    if (
      providerId !== this.#providerId ||
      modelId !== this.modelId ||
      targetLanguage !== this.#targetLanguage
    ) {
      return;
    }
    this.#pageNumber = pageNumber;
    this.#translation = translation;
    this.#requestError = null;
    this.#render();
    this.#scheduleAutoRequest(
      autoTranslateIfMissing &&
        translation === null &&
        this.#autoTranslate &&
        this.#apiKeys.has(this.#providerId),
    );
  }

  showError(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumber: number,
    message: string,
  ): void {
    if (!this.#matches(providerId, modelId, targetLanguage, pageNumber)) return;
    this.#requestError = message;
    this.#render();
  }

  async #requestTranslation(): Promise<void> {
    if (this.#busy) return;
    this.#cancelPendingAutoRequest();
    const apiKey = this.#apiKeys.get(this.#providerId);
    if (!apiKey) {
      this.#requestError = `${this.#provider().displayName} API 키가 필요합니다. 설정에서 키를 입력하세요.`;
      this.#render();
      this.#openSettings(true);
      return;
    }

    const requestedProviderId = this.#providerId;
    const requestedModelId = this.modelId;
    const requestedTargetLanguage = this.#targetLanguage;
    const requestedPage = this.#pageNumber;
    const previous = this.#translation;
    this.#requestError = null;
    this.#busy = true;
    this.#render();

    try {
      const translation = await this.#actions.translate(
        requestedProviderId,
        requestedModelId,
        requestedTargetLanguage,
        requestedPage,
        apiKey,
      );
      if (
        this.#matches(requestedProviderId, requestedModelId, requestedTargetLanguage, requestedPage)
      ) {
        this.#translation = translation;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (
          this.#matches(
            requestedProviderId,
            requestedModelId,
            requestedTargetLanguage,
            requestedPage,
          )
        ) {
          this.#translation = previous;
        }
        return;
      }
      if (
        this.#matches(requestedProviderId, requestedModelId, requestedTargetLanguage, requestedPage)
      ) {
        this.#translation = previous;
        this.#requestError = errorMessage(error);
      }
    } finally {
      this.#busy = false;
      this.#render();
      this.#runPendingAutoRequest();
    }
  }

  async #copyTranslation(): Promise<void> {
    if (!this.#translation) return;
    try {
      await navigator.clipboard.writeText(this.#translation.text);
      this.#status.textContent = "번역을 클립보드에 복사했습니다.";
      this.#status.hidden = false;
    } catch (error) {
      this.#requestError = `번역을 복사하지 못했습니다: ${errorMessage(error)}`;
      this.#render();
    }
  }

  #saveKey(event: SubmitEvent): void {
    event.preventDefault();
    const key = this.#keyInput.value.trim();
    if (key.length < 20) {
      this.#keyState.dataset.kind = "error";
      this.#keyState.textContent = `${this.#provider().displayName} API 키를 확인하세요.`;
      this.#keyInput.focus();
      return;
    }
    this.#apiKeys.set(this.#providerId, key);
    this.#keyInput.value = "";
    this.#requestError = null;
    this.#render();
    this.#closeSettings(true);
    this.#translateButton.focus();
  }

  #clearKey(): void {
    this.#apiKeys.delete(this.#providerId);
    this.#keyInput.value = "";
    this.#requestError = null;
    this.#render();
    this.#keyInput.focus();
  }

  #selectProvider(providerId: TranslationProviderId): void {
    if (this.#busy || providerId === this.#providerId) return;
    this.#cancelPendingAutoRequest();
    this.#providerId = providerId;
    this.#translation = null;
    this.#requestError = null;
    this.#keyInput.value = "";
    this.#syncProviderUi();
    this.#render();
    this.#actions.selectionChanged(
      providerId,
      this.modelId,
      this.#targetLanguage,
      this.#pageNumber,
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
    this.#translation = null;
    this.#requestError = null;
    this.#render();
    this.#actions.selectionChanged(provider.id, modelId, this.#targetLanguage, this.#pageNumber);
  }

  #selectTargetLanguage(): void {
    if (this.#busy) return;
    const targetLanguage = normalizedTargetLanguage(this.#targetLanguageInput.value);
    if (!targetLanguage) {
      this.#targetLanguageInput.setCustomValidity("언어명 또는 BCP 47 코드를 2~60자로 입력하세요.");
      this.#targetLanguageInput.reportValidity();
      return;
    }
    this.#targetLanguageInput.setCustomValidity("");
    this.#targetLanguageInput.value = targetLanguage;
    if (targetLanguage === this.#targetLanguage) return;
    this.#cancelPendingAutoRequest();
    this.#targetLanguage = targetLanguage;
    this.#translation = null;
    this.#requestError = null;
    this.#render();
    this.#actions.selectionChanged(
      this.#providerId,
      this.modelId,
      targetLanguage,
      this.#pageNumber,
    );
  }

  #cycleTheme(): void {
    const currentIndex = TRANSLATION_OVERLAY_THEMES.indexOf(this.#theme);
    this.#theme =
      TRANSLATION_OVERLAY_THEMES[(currentIndex + 1) % TRANSLATION_OVERLAY_THEMES.length] ??
      "balanced";
    this.#renderThemeButton();
  }

  #toggleAutoTranslate(): void {
    this.#autoTranslate = !this.#autoTranslate;
    if (!this.#autoTranslate) this.#cancelPendingAutoRequest();
    this.#renderAutoButton();
  }

  #render(): void {
    const provider = this.#provider();
    const hasKey = this.#apiKeys.has(provider.id);
    const state = this.#busy
      ? "busy"
      : this.#requestError
        ? "error"
        : this.#translation
          ? "result"
          : "empty";
    this.#root.dataset.translationState = state;
    this.#root.dataset.translationTheme = this.#theme;
    this.#renderThemeButton();
    this.#renderAutoButton();
    this.#translateButton.disabled = this.#busy;
    this.#settingsButton.disabled = this.#busy;
    this.#providerSelect.disabled = this.#busy;
    this.#modelSelect.disabled = this.#busy;
    this.#targetLanguageInput.disabled = this.#busy;
    this.#keyInput.disabled = this.#busy;
    this.#keySubmit.disabled = this.#busy;
    this.#keyDelete.disabled = this.#busy || !hasKey;
    this.#keyDelete.hidden = !hasKey;
    this.#keyState.dataset.kind = "ready";
    this.#keyState.textContent = hasKey
      ? `${provider.displayName} 키 사용 준비됨 · 탭을 닫으면 삭제됩니다.`
      : `${provider.displayName} 키가 아직 없습니다.`;
    this.#resultState.hidden = !this.#translation;
    this.#resultState.textContent = this.#translation
      ? this.#resultSummary(this.#translation)
      : "";

    this.#status.hidden = true;
    this.#errorBox.hidden = !this.#requestError;
    this.#errorText.textContent = this.#requestError ?? "";
    this.#resultActions.hidden = !this.#translation;
    this.#copyButton.disabled = !this.#translation || this.#busy;

    if (this.#busy) {
      this.#status.hidden = false;
      this.#status.textContent = "페이지 이미지를 읽고 번역하고 있습니다…";
      this.#output.textContent = this.#translation?.text ?? "";
      this.#composerLabel.textContent = "번역 중…";
      return;
    }

    if (this.#requestError) {
      this.#output.textContent = this.#translation?.text ?? "";
      this.#composerLabel.textContent = "다시 시도";
      return;
    }

    if (this.#translation) {
      this.#output.textContent = this.#translation.text;
      this.#composerLabel.textContent = "현재 페이지 다시 번역";
      return;
    }

    this.#output.textContent = "";
    this.#composerLabel.textContent = hasKey
      ? `페이지 ${this.#pageNumber} 번역하기`
      : "API 키 설정하고 번역하기";
  }

  #resultSummary(translation: CachedPageTranslation): string {
    const provider = this.#providers.get(translation.providerId);
    const model = provider?.models.find(({ id }) => id === translation.model);
    const source = `${provider?.displayName ?? translation.providerId} · ${model?.displayName ?? translation.model} · ${translation.targetLanguage}`;
    const { inputTokens, outputTokens } = translation.usage;
    const usage =
      inputTokens === undefined && outputTokens === undefined
        ? ""
        : ` · ${inputTokens ?? "?"} 입력 / ${outputTokens ?? "?"} 출력 토큰`;
    return `현재 결과 · 페이지 ${this.#pageNumber} · ${source} · 캐시됨${usage}`;
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
    this.#apiKeyLink.textContent = `${provider.displayName} API 키 받기 ↗`;
    this.#keyInput.placeholder = provider.apiKeyPlaceholder;
    this.#keyDescription.textContent =
      `키는 이 뷰어 탭의 메모리에만 유지되며 저장되지 않습니다. ` +
      `번역할 때 현재 페이지 이미지와 번역 지시문이 ${provider.displayName}로 전송됩니다.`;
  }

  #renderThemeButton(): void {
    const theme = TRANSLATION_OVERLAY_THEME_UI[this.#theme];
    const nextTheme =
      TRANSLATION_OVERLAY_THEMES[
        (TRANSLATION_OVERLAY_THEMES.indexOf(this.#theme) + 1) %
          TRANSLATION_OVERLAY_THEMES.length
      ] ?? "balanced";
    const next = TRANSLATION_OVERLAY_THEME_UI[nextTheme];
    const label = `번역 배경: ${theme.label} · 누르면 ${next.label}`;
    this.#root.dataset.translationTheme = this.#theme;
    this.#themeButton.dataset.translationTheme = this.#theme;
    this.#themeButton.setAttribute("aria-label", label);
    this.#themeButton.title = label;
    this.#themeIndicator.textContent = theme.indicator;
  }

  #renderAutoButton(): void {
    this.#autoButton.setAttribute("aria-pressed", String(this.#autoTranslate));
    this.#autoButton.setAttribute(
      "aria-label",
      this.#autoTranslate ? "자동 번역 끄기" : "자동 번역 켜기",
    );
  }

  #runPendingAutoRequest(): void {
    if (
      !this.#autoRequestPending ||
      this.#autoRequestTimer !== 0 ||
      this.#busy ||
      !this.isOpen
    ) {
      return;
    }
    this.#autoRequestPending = false;
    void this.#requestTranslation();
  }

  #scheduleAutoRequest(shouldRequest: boolean): void {
    this.#cancelPendingAutoRequest();
    if (!shouldRequest) return;
    this.#autoRequestPending = true;
    this.#autoRequestTimer = window.setTimeout(() => {
      this.#autoRequestTimer = 0;
      this.#runPendingAutoRequest();
    }, AUTO_TRANSLATION_DELAY_MS);
  }

  #cancelPendingAutoRequest(): void {
    window.clearTimeout(this.#autoRequestTimer);
    this.#autoRequestTimer = 0;
    this.#autoRequestPending = false;
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

  #matches(
    providerId: TranslationProviderId,
    modelId: string,
    targetLanguage: string,
    pageNumber: number,
  ): boolean {
    return (
      this.#providerId === providerId &&
      this.modelId === modelId &&
      this.#targetLanguage === targetLanguage &&
      this.#pageNumber === pageNumber
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
