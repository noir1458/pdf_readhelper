import { describe, expect, it } from "vitest";
import { classifyPdfUrl, looksLikePdfUrl, sourceUrlFromLocation } from "../src/shared/source";

describe("PDF source helpers", () => {
  it("classifies remote and local URLs", () => {
    expect(classifyPdfUrl("https://example.com/a.pdf").kind).toBe("remote-url");
    expect(classifyPdfUrl("file:///Users/me/a.pdf").kind).toBe("file-url");
  });

  it("recognizes PDF paths despite query and fragment", () => {
    expect(looksLikePdfUrl("https://example.com/a.PDF?download=1#page=2")).toBe(true);
    expect(looksLikePdfUrl("https://example.com/viewer?id=1")).toBe(false);
  });

  it("reads the viewer URL query", () => {
    expect(sourceUrlFromLocation("?url=https%3A%2F%2Fexample.com%2Fa.pdf")).toBe(
      "https://example.com/a.pdf",
    );
  });
});
