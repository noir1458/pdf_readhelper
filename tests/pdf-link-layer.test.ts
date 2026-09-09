import { AnnotationType, type PDFDocumentProxy } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import { destinationPageNumber } from "../src/viewer/pdf-destination";
import {
  namedActionPage,
  pdfLinkRegions,
  viewportLinkRectangle,
} from "../src/viewer/pdf-link-layer";

describe("PDF link layer", () => {
  it("keeps safe external URLs and internal destinations only", () => {
    const regions = pdfLinkRegions([
      {
        annotationType: AnnotationType.LINK,
        rect: [10, 20, 40, 60],
        url: "https://example.com/docs",
      },
      { annotationType: AnnotationType.LINK, rect: [1, 2, 3, 4], dest: "chapter-2" },
      {
        annotationType: AnnotationType.LINK,
        rect: [1, 2, 3, 4],
        url: "javascript:alert(1)",
      },
      { annotationType: AnnotationType.TEXT, rect: [1, 2, 3, 4], url: "https://ignored.test" },
    ]);

    expect(regions).toHaveLength(2);
    expect(regions[0]?.target).toMatchObject({
      kind: "external",
      url: "https://example.com/docs",
    });
    expect(regions[1]?.target).toEqual({
      kind: "destination",
      destination: "chapter-2",
      title: "Go to PDF destination",
    });
  });

  it("normalizes rotated viewport corners into a positive overlay rectangle", () => {
    const viewport = {
      convertToViewportPoint: vi.fn().mockReturnValueOnce([80, 15]).mockReturnValueOnce([20, 45]),
    };
    expect(viewportLinkRectangle(viewport, [1, 2, 3, 4])).toEqual({
      left: 20,
      top: 15,
      width: 60,
      height: 30,
    });
  });

  it("maps supported named page actions and clamps at document edges", () => {
    expect(namedActionPage("FirstPage", 4, 10)).toBe(1);
    expect(namedActionPage("LastPage", 4, 10)).toBe(10);
    expect(namedActionPage("NextPage", 10, 10)).toBe(10);
    expect(namedActionPage("PrevPage", 1, 10)).toBe(1);
    expect(namedActionPage("Print", 4, 10)).toBeNull();
  });

  it("resolves both numeric and referenced internal destinations", async () => {
    const getDestination = vi.fn(() => Promise.resolve([{ num: 9, gen: 0 }]));
    const getPageIndex = vi.fn(() => Promise.resolve(6));
    const document = { getDestination, getPageIndex } as unknown as PDFDocumentProxy;

    await expect(destinationPageNumber(document, [3])).resolves.toBe(4);
    await expect(destinationPageNumber(document, "chapter")).resolves.toBe(7);
    expect(getDestination).toHaveBeenCalledWith("chapter");
    expect(getPageIndex).toHaveBeenCalledWith({ num: 9, gen: 0 });
  });
});
