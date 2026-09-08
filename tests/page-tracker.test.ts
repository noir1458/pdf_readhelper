import { describe, expect, it } from "vitest";
import { selectCurrentPage } from "../src/viewer/page-tracker";

describe("current page selection", () => {
  it("prefers the page with stronger visibility and center proximity", () => {
    expect(
      selectCurrentPage(
        [
          { pageNumber: 6, intersectionRatio: 0.2, centerDistance: 500 },
          { pageNumber: 7, intersectionRatio: 0.8, centerDistance: 80 },
        ],
        6,
        900,
      ),
    ).toBe(7);
  });

  it("uses hysteresis near a page boundary", () => {
    expect(
      selectCurrentPage(
        [
          { pageNumber: 6, intersectionRatio: 0.5, centerDistance: 220 },
          { pageNumber: 7, intersectionRatio: 0.52, centerDistance: 200 },
        ],
        6,
        900,
      ),
    ).toBe(6);
  });
});
