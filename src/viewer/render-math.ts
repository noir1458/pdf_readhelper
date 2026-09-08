export type Dimensions = { width: number; height: number };
export type FitMode = "width" | "height";

export function limitedScale(
  baseWidth: number,
  baseHeight: number,
  requestedScale: number,
  maxPixels: number,
): number {
  if (baseWidth <= 0 || baseHeight <= 0 || requestedScale <= 0 || maxPixels <= 0) return 1;
  const requestedPixels = baseWidth * baseHeight * requestedScale * requestedScale;
  if (requestedPixels <= maxPixels) return requestedScale;
  return Math.sqrt(maxPixels / (baseWidth * baseHeight));
}

export function canvasDimensions(width: number, height: number, scale: number): Dimensions {
  return {
    width: Math.max(1, Math.ceil(width * scale)),
    height: Math.max(1, Math.ceil(height * scale)),
  };
}

export function fittedScale(
  pageWidth: number,
  pageHeight: number,
  availableWidth: number,
  availableHeight: number,
  mode: FitMode,
): number {
  const pageLength = mode === "width" ? pageWidth : pageHeight;
  const availableLength = mode === "width" ? availableWidth : availableHeight;
  if (pageLength <= 0 || availableLength <= 0) return 1;
  return availableLength / pageLength;
}
