import { describe, expect, it } from "vitest";
import { hasFileDragType } from "../src/viewer/drag-data";

describe("drag data classification", () => {
  it("recognizes an external file drag", () => {
    expect(hasFileDragType(["text/uri-list", "Files"])).toBe(true);
  });

  it("ignores the saved-document reorder payload", () => {
    expect(hasFileDragType(["text/plain"])).toBe(false);
  });
});
