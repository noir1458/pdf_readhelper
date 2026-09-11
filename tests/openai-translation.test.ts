import { describe, expect, it } from "vitest";
import { extractResponseText } from "../src/translation/openai-translation";
import { translationCacheKey } from "../src/translation/translation-cache";

describe("OpenAI translation responses", () => {
  it("reads the convenience output_text field", () => {
    expect(extractResponseText({ output_text: "  번역 결과  " })).toBe("번역 결과");
  });

  it("joins nested output text parts from the REST response", () => {
    expect(
      extractResponseText({
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "첫 문단" },
              { type: "refusal", refusal: "ignored" },
              { type: "output_text", text: "둘째 문단" },
            ],
          },
        ],
      }),
    ).toBe("첫 문단\n둘째 문단");
  });

  it("returns null for a response without text", () => {
    expect(extractResponseText({ output: [] })).toBeNull();
  });
});

describe("translation cache keys", () => {
  it("separates providers, documents, pages, and models", () => {
    const key = translationCacheKey("document-a", 17, "openai", "gpt-5.6-luna");
    expect(key).toContain("document-a:17");
    expect(key).not.toBe(translationCacheKey("document-a", 17, "gemini", "gpt-5.6-luna"));
    expect(key).not.toBe(translationCacheKey("document-a", 18, "openai", "gpt-5.6-luna"));
    expect(key).not.toBe(translationCacheKey("document-b", 17, "openai", "gpt-5.6-luna"));
    expect(key).not.toBe(translationCacheKey("document-a", 17, "openai", "gpt-5.6-terra"));
  });
});
