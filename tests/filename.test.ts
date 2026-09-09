import { describe, expect, it } from "vitest";
import { originalPdfFilename, rangeFilename } from "../src/shared/filename";

describe("rangeFilename", () => {
  it("uses a single page name", () => expect(rangeFilename({ start: 7, end: 7 })).toBe("7.pdf"));
  it("uses an inclusive range name", () =>
    expect(rangeFilename({ start: 2, end: 11 })).toBe("2-11.pdf"));
});

describe("originalPdfFilename", () => {
  it("keeps a safe local PDF filename", () => {
    expect(originalPdfFilename({ kind: "local-file", name: "Learning Go.pdf" })).toBe(
      "Learning Go.pdf",
    );
  });

  it("decodes URL filenames and adds a missing PDF extension", () => {
    expect(
      originalPdfFilename({
        kind: "remote-url",
        url: "https://example.com/books/A%20Tour%20of%20C%2B%2B.pdf?download=1",
      }),
    ).toBe("A Tour of C++.pdf");
    expect(
      originalPdfFilename({ kind: "remote-url", url: "https://example.com/papers/latest" }),
    ).toBe("latest.pdf");
  });

  it("falls back for URL roots and removes unsafe filename characters", () => {
    expect(originalPdfFilename({ kind: "remote-url", url: "https://example.com/" })).toBe(
      "document.pdf",
    );
    expect(originalPdfFilename({ kind: "local-file", name: "notes: chapter?.pdf" })).toBe(
      "notes_ chapter_.pdf",
    );
  });
});
