export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type PixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Rgb = { red: number; green: number; blue: number };

const COLOR_BUCKET_SIZE = 16;
const CONTENT_DISTANCE = 24;
const BORDER_MATCH_DISTANCE = 18;
const MIN_BORDER_MATCH_RATIO = 0.72;
const MAX_BACKGROUND_CHANNEL_SPREAD = 24;
const CONTENT_PADDING_RATIO = 0.025;
const MIN_ACTIVE_PIXELS = 2;
const ACTIVE_PROJECTION_RATIO = 0.0015;

export function fullImageBounds(width: number, height: number): PixelBounds {
  return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
}

export function detectContentBounds(image: PixelBuffer): PixelBounds {
  const { data, width, height } = image;
  const full = fullImageBounds(width, height);
  if (width < 3 || height < 3 || data.length < width * height * 4) return full;

  const border = borderPixelIndices(width, height);
  const background = dominantBorderColor(data, border);
  if (!background || !isNeutral(background)) return full;

  const matchingBorderPixels = border.reduce(
    (count, index) =>
      count + (colorDistance(data, index, background) <= BORDER_MATCH_DISTANCE ? 1 : 0),
    0,
  );
  if (matchingBorderPixels / border.length < MIN_BORDER_MATCH_RATIO) return full;

  const rowCounts = new Uint32Array(height);
  const columnCounts = new Uint32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (colorDistance(data, index, background) < CONTENT_DISTANCE) continue;
      rowCounts[y] = (rowCounts[y] ?? 0) + 1;
      columnCounts[x] = (columnCounts[x] ?? 0) + 1;
    }
  }

  const minimumRowPixels = Math.max(MIN_ACTIVE_PIXELS, Math.ceil(width * ACTIVE_PROJECTION_RATIO));
  const minimumColumnPixels = Math.max(
    MIN_ACTIVE_PIXELS,
    Math.ceil(height * ACTIVE_PROJECTION_RATIO),
  );
  const top = firstActive(rowCounts, minimumRowPixels);
  const bottom = lastActive(rowCounts, minimumRowPixels);
  const left = firstActive(columnCounts, minimumColumnPixels);
  const right = lastActive(columnCounts, minimumColumnPixels);
  if (top < 0 || bottom < top || left < 0 || right < left) return full;

  const horizontalPadding = Math.max(2, Math.ceil(width * CONTENT_PADDING_RATIO));
  const verticalPadding = Math.max(2, Math.ceil(height * CONTENT_PADDING_RATIO));
  const x = Math.max(0, left - horizontalPadding);
  const y = Math.max(0, top - verticalPadding);
  const farX = Math.min(width, right + 1 + horizontalPadding);
  const farY = Math.min(height, bottom + 1 + verticalPadding);

  return { x, y, width: farX - x, height: farY - y };
}

export function scaleBounds(
  bounds: PixelBounds,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): PixelBounds {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return fullImageBounds(targetWidth, targetHeight);
  }

  const x = Math.max(0, Math.floor((bounds.x / sourceWidth) * targetWidth));
  const y = Math.max(0, Math.floor((bounds.y / sourceHeight) * targetHeight));
  const farX = Math.min(
    targetWidth,
    Math.ceil(((bounds.x + bounds.width) / sourceWidth) * targetWidth),
  );
  const farY = Math.min(
    targetHeight,
    Math.ceil(((bounds.y + bounds.height) / sourceHeight) * targetHeight),
  );
  return {
    x,
    y,
    width: Math.max(1, farX - x),
    height: Math.max(1, farY - y),
  };
}

function borderPixelIndices(width: number, height: number): number[] {
  const indices: number[] = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let x = 0; x < width; x += stride) {
    indices.push(x * 4, ((height - 1) * width + x) * 4);
  }
  for (let y = stride; y < height - 1; y += stride) {
    indices.push(y * width * 4, (y * width + width - 1) * 4);
  }
  return indices;
}

function dominantBorderColor(data: Uint8ClampedArray, indices: number[]): Rgb | null {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  for (const index of indices) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const key =
      Math.floor(red / COLOR_BUCKET_SIZE) * 256 +
      Math.floor(green / COLOR_BUCKET_SIZE) * 16 +
      Math.floor(blue / COLOR_BUCKET_SIZE);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  let dominant: { count: number; red: number; green: number; blue: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) dominant = bucket;
  }
  if (!dominant) return null;
  return {
    red: dominant.red / dominant.count,
    green: dominant.green / dominant.count,
    blue: dominant.blue / dominant.count,
  };
}

function isNeutral(color: Rgb): boolean {
  const brightest = Math.max(color.red, color.green, color.blue);
  const darkest = Math.min(color.red, color.green, color.blue);
  return brightest - darkest <= MAX_BACKGROUND_CHANNEL_SPREAD;
}

function colorDistance(data: Uint8ClampedArray, index: number, color: Rgb): number {
  return Math.max(
    Math.abs((data[index] ?? 0) - color.red),
    Math.abs((data[index + 1] ?? 0) - color.green),
    Math.abs((data[index + 2] ?? 0) - color.blue),
  );
}

function firstActive(values: Uint32Array, minimum: number): number {
  for (let index = 0; index < values.length; index += 1) {
    if ((values[index] ?? 0) >= minimum) return index;
  }
  return -1;
}

function lastActive(values: Uint32Array, minimum: number): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if ((values[index] ?? 0) >= minimum) return index;
  }
  return -1;
}
