import { describe, expect, it } from "vitest";
import {
  contentFittedScale,
  pageContentBox,
  type PageContentMeasurement,
} from "../src/viewer/page-content-bounds";

const measurement: PageContentMeasurement = {
  pageWidth: 600,
  pageHeight: 800,
  analysisWidth: 300,
  analysisHeight: 400,
  bounds: { x: 50, y: 40, width: 200, height: 320 },
  usesFullPage: false,
};

describe("page content fit", () => {
  it("maps detected analysis pixels into page coordinates", () => {
    expect(pageContentBox(measurement)).toEqual({ x: 100, y: 80, width: 400, height: 640 });
  });

  it("fits both dimensions of the detected content", () => {
    expect(contentFittedScale(measurement, 900, 720)).toBeCloseTo(1.125);
  });

  it("falls back safely for invalid available space", () => {
    expect(contentFittedScale(measurement, 0, 720)).toBe(1);
  });
});
