import { describe, expect, it } from "vitest";
import {
  documentLibraryTitle,
  sortSavedDocuments,
  type SavedDocumentSummary,
} from "../src/viewer/document-library";

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

describe("saved document ordering", () => {
  const record = (id: string, updatedAt: number, sortOrder?: number): SavedDocumentSummary => ({
    id,
    title: `${id}.pdf`,
    source: { kind: "local-file", name: `${id}.pdf` },
    thumbnail: null,
    lastPage: 1,
    totalPages: 10,
    updatedAt,
    ...(sortOrder === undefined ? {} : { sortOrder }),
  });

  it("uses a persisted manual order instead of recent-reading time", () => {
    const records = [record("a", 300, 2), record("b", 100, 0), record("c", 200, 1)];
    expect(sortSavedDocuments(records).map(({ id }) => id)).toEqual(["b", "c", "a"]);
  });

  it("puts new unordered documents first and keeps legacy records newest-first", () => {
    const records = [record("manual", 500, 0), record("old", 100), record("new", 300)];
    expect(sortSavedDocuments(records).map(({ id }) => id)).toEqual(["new", "old", "manual"]);
  });
});
