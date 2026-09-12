import { UserFacingError } from "../shared/errors";
import {
  finiteNumber,
  isRecord,
  translationPrompt,
  type PageTranslation,
  type TranslationProvider,
  type TranslationUsage,
} from "./translation-provider";

export const GEMINI_TRANSLATION_MODEL = "gemini-3.8-flash";
export const GEMINI_TRANSLATION_MODELS = [
  { id: GEMINI_TRANSLATION_MODEL, displayName: "Gemini 3.8 Flash" },
  { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite" },
] as const;

export const GEMINI_TRANSLATION_PROVIDER: TranslationProvider = {
  id: "gemini",
  displayName: "Gemini",
  defaultModelId: GEMINI_TRANSLATION_MODEL,
  models: GEMINI_TRANSLATION_MODELS,
  apiKeyPlaceholder: "AIza…",
  apiKeyUrl: "https://aistudio.google.com/app/apikey",
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
  const imageData = await blobToBase64(image);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: translationPrompt(pageNumber, targetLanguage) },
              {
                inline_data: {
                  mime_type: image.type || "image/png",
                  data: imageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "low" },
          maxOutputTokens: 5_000,
        },
      }),
      signal: signal ?? null,
    },
  );

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new UserFacingError(apiErrorMessage(response.status, payload));

  const text = extractGeminiResponseText(payload);
  if (!text) {
    throw new UserFacingError(blockedOrEmptyMessage(payload));
  }
  return {
    text,
    model: modelId,
    usage: geminiResponseUsage(payload),
  };
}

export function extractGeminiResponseText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
  const parts: string[] = [];
  for (const candidate of payload.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    if (!Array.isArray(candidate.content.parts)) continue;
    for (const part of candidate.content.parts) {
      if (
        isRecord(part) &&
        part.thought !== true &&
        typeof part.text === "string" &&
        part.text.trim()
      ) {
        parts.push(part.text.trim());
      }
    }
  }
  const text = parts.join("\n").trim();
  return text.length > 0 ? text : null;
}

export function geminiResponseUsage(payload: unknown): TranslationUsage {
  if (!isRecord(payload) || !isRecord(payload.usageMetadata)) return {};
  const usage: TranslationUsage = {};
  const inputTokens = finiteNumber(payload.usageMetadata.promptTokenCount);
  const candidateTokens = finiteNumber(payload.usageMetadata.candidatesTokenCount);
  const thoughtTokens = finiteNumber(payload.usageMetadata.thoughtsTokenCount);
  if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  if (candidateTokens !== undefined || thoughtTokens !== undefined) {
    usage.outputTokens = (candidateTokens ?? 0) + (thoughtTokens ?? 0);
  }
  return usage;
}

function apiErrorMessage(status: number, payload: unknown): string {
  const message = responseError(payload);
  if (status === 401 || status === 403 || isInvalidApiKey(payload)) {
    return "Gemini가 이 API 키를 거부했습니다. 키와 연결된 프로젝트를 확인하세요.";
  }
  if (status === 429) {
    return message ?? "Gemini 요청 한도 또는 결제 잔액을 확인한 뒤 다시 시도하세요.";
  }
  if (status === 503) {
    return "현재 Gemini 모델 사용량이 많습니다. 잠시 후 다시 시도하거나 설정에서 다른 모델을 선택하세요.";
  }
  return message ? `Gemini 요청 실패: ${message}` : `Gemini 요청 실패 (${status}).`;
}

function blockedOrEmptyMessage(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.promptFeedback)) {
    const reason = payload.promptFeedback.blockReason;
    if (typeof reason === "string" && reason) {
      return `Gemini가 이 페이지 처리를 차단했습니다 (${reason}).`;
    }
  }
  return "Gemini가 이 페이지의 번역문을 반환하지 않았습니다.";
}

function responseError(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  return typeof payload.error.message === "string" ? payload.error.message : null;
}

function isInvalidApiKey(payload: unknown): boolean {
  if (!isRecord(payload) || !isRecord(payload.error)) return false;
  const message = payload.error.message;
  const status = payload.error.status;
  return (
    status === "UNAUTHENTICATED" ||
    (typeof message === "string" && message.toLowerCase().includes("api key not valid"))
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks: string[] = [];
    const chunkSize = 32_768;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(chunks.join(""));
  } catch (error) {
    throw new UserFacingError("번역할 페이지 이미지를 준비하지 못했습니다.", { cause: error });
  }
}
