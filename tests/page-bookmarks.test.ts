import { describe, expect, it } from "vitest";
import {
  bookmarkTitleFromText,
  pageBookmarkKey,
  sortPageBookmarks,
  type PageBookmark,
} from "../src/viewer/page-bookmarks";

describe("page bookmarks", () => {
  it("builds collision-safe document/page keys", () => {
    expect(pageBookmarkKey("book:part", 12)).toBe('["book:part",12]');
    expect(pageBookmarkKey("book", 12)).not.toBe(pageBookmarkKey("book:1", 2));
  });

  it("sorts bookmarks by page and then creation time", () => {
    const bookmark = (pageNumber: number, createdAt: number): PageBookmark => ({
      id: pageBookmarkKey("book", pageNumber),
      documentId: "book",
      pageNumber,
      title: `Page ${pageNumber}`,
      createdAt,
    });
    expect(
      sortPageBookmarks([bookmark(8, 30), bookmark(2, 20), bookmark(8, 10)]).map(
        ({ pageNumber, createdAt }) => [pageNumber, createdAt],
      ),
    ).toEqual([
      [2, 20],
      [8, 10],
      [8, 30],
    ]);
  });

  it("uses the first meaningful text item as the title", () => {
    expect(
      bookmarkTitleFromText(
        { items: [{ str: "  27 " }, { type: "beginMarkedContent" }, { str: " Process State " }] },
        54,
      ),
    ).toBe("Process State");
  });

  it("falls back for textless pages and bounds long titles", () => {
    expect(bookmarkTitleFromText({ items: [] }, 7)).toBe("Page 7");
    const title = bookmarkTitleFromText({ items: [{ str: "A".repeat(140) }] }, 3);
    expect(title).toHaveLength(90);
    expect(title.endsWith("…")).toBe(true);
  });
});
