import type { PDFDocumentProxy } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import {
  createPageSearchIndex,
  findPageMatches,
  normalizeSearchQuery,
  PdfDocumentSearch,
} from "../src/viewer/pdf-search";

describe("PDF text search", () => {
  it("normalizes surrounding whitespace, repeated spaces, and case", () => {
    expect(normalizeSearchQuery("  Process   STATE  ")).toBe("process state");
  });

  it("maps a phrase spanning text items back to exact item ranges", () => {
    const index = createPageSearchIndex({
      items: [{ str: "Hello" }, { type: "beginMarkedContent" }, { str: "world" }],
    });

    expect(findPageMatches(index, "lo wo")).toEqual([
      [
        { itemIndex: 0, start: 3, end: 5 },
        { itemIndex: 1, start: 0, end: 2 },
      ],
    ]);
  });

  it("searches every page concurrently and reuses extracted page indexes", async () => {
    const getTextContent = [
      vi.fn(() => Promise.resolve({ items: [{ str: "alpha beta" }] })),
      vi.fn(() => Promise.resolve({ items: [{ str: "beta beta" }] })),
    ];
    const getPage = vi.fn((pageNumber: number) =>
      Promise.resolve({ getTextContent: getTextContent[pageNumber - 1] }),
    );
    const document = {
      numPages: 2,
      getPage,
    } as unknown as PDFDocumentProxy;
    const search = new PdfDocumentSearch(document);
    const progress = vi.fn();

    const first = await search.search("beta", undefined, progress);
    const second = await search.search("alpha");

    expect(first).toHaveLength(3);
    expect(first.map((match) => match.pageNumber)).toEqual([1, 2, 2]);
    expect(second).toHaveLength(1);
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });
});
