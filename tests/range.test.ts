import { describe, expect, it } from "vitest";
import { pageIndices, parsePageRange } from "../src/shared/range";

 describe("page range", () => {
  it("converts 2-11 to ten zero-based page indices", () => {
    const range = parsePageRange("2-11", 20);
    expect(range).toEqual({ start: 2, end: 11 });
    expect(pageIndices(range)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each(["2", "1-1", "2 - 11"])("accepts %s", (value) => {
    expect(parsePageRange(value, 20)).toBeTruthy();
  });

  it.each(["11-2", "0-2", "word", "2-999"])("rejects %s", (value) => {
    expect(() => parsePageRange(value, 20)).toThrow();
  });
});
