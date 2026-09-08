import { describe, expect, it } from "vitest";
import { documentLibraryTitle } from "../src/viewer/document-library";

describe("saved document titles", () => {
  it("keeps a local filename", () => {
    expect(documentLibraryTitle({ kind: "local-file", name: "paper.pdf" })).toBe("paper.pdf");
  });

  it("decodes a filename from a remote URL", () => {
    expect(
      documentLibraryTitle({
        kind: "remote-url",
        url: "https://example.com/books/A%20Tour%20of%20C%2B%2B.pdf?download=1",
      }),
    ).toBe("A Tour of C++.pdf");
  });
});
