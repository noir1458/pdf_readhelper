import { describe, expect, it } from "vitest";
import {
  detectContentBounds,
  fullImageBounds,
  scaleBounds,
  type PixelBuffer,
} from "../src/viewer/content-bounds";

function image(width: number, height: number, color = [255, 255, 255]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0] ?? 0;
    data[index + 1] = color[1] ?? 0;
    data[index + 2] = color[2] ?? 0;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

function fill(
  target: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  color = [0, 0, 0],
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const index = (row * target.width + column) * 4;
      target.data[index] = color[0] ?? 0;
      target.data[index + 1] = color[1] ?? 0;
      target.data[index + 2] = color[2] ?? 0;
    }
  }
}

describe("content bounds", () => {
  it("finds content on a neutral page and retains safety padding", () => {
    const page = image(200, 300);
    fill(page, 40, 60, 120, 180);

    expect(detectContentBounds(page)).toEqual({ x: 35, y: 52, width: 130, height: 196 });
  });

  it("ignores isolated edge noise", () => {
    const page = image(200, 300);
    fill(page, 40, 60, 120, 180);
    fill(page, 1, 1, 1, 1);

    expect(detectContentBounds(page)).toEqual({ x: 35, y: 52, width: 130, height: 196 });
  });

  it("keeps a colored full-bleed page intact", () => {
    const page = image(120, 180, [210, 32, 65]);
    fill(page, 30, 40, 60, 80, [255, 210, 20]);

    expect(detectContentBounds(page)).toEqual(fullImageBounds(120, 180));
  });

  it("keeps blank pages intact", () => {
    expect(detectContentBounds(image(120, 180))).toEqual(fullImageBounds(120, 180));
  });

  it("maps analysis bounds outward to export pixels", () => {
    expect(scaleBounds({ x: 10, y: 20, width: 30, height: 40 }, 100, 200, 250, 500)).toEqual({
      x: 25,
      y: 50,
      width: 75,
      height: 100,
    });
  });
});
