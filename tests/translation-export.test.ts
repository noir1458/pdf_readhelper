import { describe, expect, it } from "vitest";
import type { CachedPageTranslation } from "../src/translation/translation-cache";
import { formatTranslationExport } from "../src/translation/translation-export";

function translation(pageNumber: number, text: string): CachedPageTranslation {
  return {
    id: `translation-${pageNumber}`,
    documentId: "document-a",
    pageNumber,
    providerId: "gemini",
    model: "gemini-test",
    targetLanguage: "Korean (ko)",
    text,
    usage: {},
    updatedAt: pageNumber,
  };
}

describe("translation text export", () => {
  it("sorts cached pages and omits gaps", () => {
    expect(formatTranslationExport([translation(7, "일곱"), translation(2, "둘")])).toBe(
      "페이지 2\n\n둘\n\n──────────\n\n페이지 7\n\n일곱\n",
    );
  });

  it("returns an empty string when no translation is cached", () => {
    expect(formatTranslationExport([])).toBe("");
  });
});
