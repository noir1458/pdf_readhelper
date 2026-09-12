import { UserFacingError } from "../shared/errors";
import {
  finiteNumber,
  isRecord,
  translationPrompt,
  type PageTranslation,
  type TranslationProvider,
  type TranslationUsage,
} from "./translation-provider";

export const OPENAI_TRANSLATION_MODEL = "gpt-5.6-luna";
export const OPENAI_TRANSLATION_MODELS = [
  { id: OPENAI_TRANSLATION_MODEL, displayName: "GPT-5.6 Luna" },
] as const;

export const OPENAI_TRANSLATION_PROVIDER: TranslationProvider = {
  id: "openai",
  displayName: "OpenAI",
  defaultModelId: OPENAI_TRANSLATION_MODEL,
  models: OPENAI_TRANSLATION_MODELS,
  apiKeyPlaceholder: "sk-…",
  apiKeyUrl: "https://platform.openai.com/api-keys",
  translatePageImage,
};

export async function translatePageImage(
  modelId: string,
  apiKey: string,
  image: Blob,
  pageNumber: number,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<PageTranslation> {
  const imageUrl = await blobToDataUrl(image);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 5_000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: translationPrompt(pageNumber, targetLanguage),
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high",
            },
          ],
        },
      ],
    }),
    signal: signal ?? null,
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new UserFacingError(apiErrorMessage(response.status, payload));

  const text = extractResponseText(payload);
  if (!text) throw new UserFacingError("OpenAI returned no translated text for this page.");
  return {
    text,
    model: responseModel(payload) ?? modelId,
    usage: responseUsage(payload),
  };
}

export function extractResponseText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return null;

  const parts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  const text = parts.join("\n").trim();
  return text.length > 0 ? text : null;
}

function apiErrorMessage(status: number, payload: unknown): string {
  const message = responseError(payload);
  if (status === 401) return "OpenAI rejected this API key. Check the key and try again.";
  if (status === 429) return message ?? "OpenAI rate or spending limit reached. Try again later.";
  return message ? `OpenAI request failed: ${message}` : `OpenAI request failed (${status}).`;
}

function responseError(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  return typeof payload.error.message === "string" ? payload.error.message : null;
}

function responseModel(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.model === "string" ? payload.model : null;
}

function responseUsage(payload: unknown): TranslationUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) return {};
  const usage: TranslationUsage = {};
  const inputTokens = finiteNumber(payload.usage.input_tokens);
  const outputTokens = finiteNumber(payload.usage.output_tokens);
  if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  return usage;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new UserFacingError("Could not prepare the page image for translation."));
    });
    reader.addEventListener("error", () =>
      reject(
        new UserFacingError("Could not prepare the page image for translation.", {
          cause: reader.error,
        }),
      ),
    );
    reader.readAsDataURL(blob);
  });
}
