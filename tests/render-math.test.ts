import { describe, expect, it } from "vitest";
import {
  canvasDimensions,
  fittedScale,
  limitedScale,
  nextRotation,
  normalizeRotation,
  pageWidthForLayout,
} from "../src/viewer/render-math";

describe("render sizing", () => {
  it("keeps scale below the pixel cap", () => {
    const scale = limitedScale(10_000, 10_000, 2, 16_000_000);
    expect(scale).toBeCloseTo(0.4);
    const size = canvasDimensions(10_000, 10_000, scale);
    expect(size.width * size.height).toBeLessThanOrEqual(16_000_000);
  });

  it("keeps a safe requested scale", () => expect(limitedScale(600, 800, 2, 16_000_000)).toBe(2));

  it("fits a page to the requested viewport dimension", () => {
    expect(fittedScale(600, 800, 900, 700, "width")).toBe(1.5);
    expect(fittedScale(600, 800, 900, 700, "height")).toBe(0.875);
  });

  it("falls back safely for invalid fit dimensions", () => {
    expect(fittedScale(0, 800, 900, 700, "width")).toBe(1);
    expect(fittedScale(600, 800, 900, -1, "height")).toBe(1);
  });

  it("normalizes PDF and view rotations into clockwise quarter turns", () => {
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });

  it("reserves half of the viewer width for each page in spread layout", () => {
    expect(pageWidthForLayout(1222, "single")).toBe(1222);
    expect(pageWidthForLayout(1222, "spread")).toBe(600);
    expect(pageWidthForLayout(10, "spread", 22)).toBe(1);
  });
});
