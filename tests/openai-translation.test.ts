import { describe, expect, it } from "vitest";
import { extractResponseText } from "../src/translation/openai-translation";
import { translationCacheKey } from "../src/translation/translation-cache";
import { translationPrompt } from "../src/translation/translation-provider";

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
  it("keeps only one latest translation slot per document page", () => {
    const key = translationCacheKey("document-a", 17);
    expect(key).toContain("document-a:17");
    expect(key).not.toBe(translationCacheKey("document-a", 18));
    expect(key).not.toBe(translationCacheKey("document-b", 17));
  });
});

describe("translation prompt", () => {
  it("uses an English instruction with an explicit target language", () => {
    const prompt = translationPrompt(9, "Vietnamese (vi)");

    expect(prompt).toContain("PDF page 9");
    expect(prompt).toContain("Target language (language name or BCP 47 code): Vietnamese (vi).");
    expect(prompt).toContain("Do not summarize or omit content.");
  });
});
