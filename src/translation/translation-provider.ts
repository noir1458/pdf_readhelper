export type TranslationProviderId = "gemini" | "openai";

export type TranslationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type PageTranslation = {
  text: string;
  model: string;
  usage: TranslationUsage;
};

export type TranslationModelInfo = {
  id: string;
  displayName: string;
};

export type TranslationProvider = {
  id: TranslationProviderId;
  displayName: string;
  defaultModelId: string;
  models: readonly TranslationModelInfo[];
  apiKeyPlaceholder: string;
  apiKeyUrl: string;
  translatePageImage: (
    modelId: string,
    apiKey: string,
    image: Blob,
    pageNumber: number,
    targetLanguage: string,
    signal?: AbortSignal,
  ) => Promise<PageTranslation>;
};

export type TranslationProviderInfo = Pick<
  TranslationProvider,
  "id" | "displayName" | "defaultModelId" | "models" | "apiKeyPlaceholder" | "apiKeyUrl"
>;

export const DEFAULT_TRANSLATION_LANGUAGE = "Korean (ko)";

export function translationPrompt(pageNumber: number, targetLanguage: string): string {
  return [
    `Translate every readable part of PDF page ${pageNumber}.`,
    `Target language (language name or BCP 47 code): ${targetLanguage}.`,
    "Use natural, fluent wording in the target language.",
    "Do not summarize or omit content.",
    "Preserve the original order and structure of headings, paragraphs, lists, captions, footnotes, and page labels.",
    "Keep code, commands, paths, identifiers, and formulas unchanged, translating only their surrounding prose.",
    "Return only the translation as clean plain text. Do not add commentary about the task or the image.",
  ].join(" ");
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
