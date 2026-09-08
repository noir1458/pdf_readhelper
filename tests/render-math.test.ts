import { describe, expect, it } from "vitest";
import { canvasDimensions, fittedScale, limitedScale } from "../src/viewer/render-math";

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
});
