import { UserFacingError } from "../shared/errors";

export const OPENAI_TRANSLATION_MODEL = "gpt-5.6-luna";

export type TranslationUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type OpenAiPageTranslation = {
  text: string;
  model: string;
  usage: TranslationUsage;
};

export async function translatePageImage(
  apiKey: string,
  image: Blob,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<OpenAiPageTranslation> {
  const imageUrl = await blobToDataUrl(image);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TRANSLATION_MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 5_000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: translationPrompt(pageNumber),
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
    model: responseModel(payload) ?? OPENAI_TRANSLATION_MODEL,
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

function translationPrompt(pageNumber: number): string {
  return [
    `Translate every readable part of PDF page ${pageNumber} into natural Korean.`,
    "Do not summarize or omit content.",
    "Preserve the original order and structure of headings, paragraphs, lists, captions, footnotes, and page labels.",
    "Keep code, commands, paths, identifiers, and formulas unchanged, translating only their surrounding prose.",
    "Return only the translation as clean plain text. Do not add commentary about the task or the image.",
  ].join(" ");
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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
