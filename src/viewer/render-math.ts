import type { PageLayout, ViewRotation, ZoomMode } from "../shared/types";

export type Dimensions = { width: number; height: number };
export type FitMode = "width" | "height" | "content";

export function fitModeForZoomMode(mode: ZoomMode): FitMode | null {
  if (mode === "fit-width") return "width";
  if (mode === "fit-height") return "height";
  if (mode === "fit-content") return "content";
  return null;
}

export function normalizeRotation(value: number): ViewRotation {
  const normalized = (((Math.round(value / 90) * 90) % 360) + 360) % 360;
  return normalized as ViewRotation;
}

export function nextRotation(value: ViewRotation): ViewRotation {
  return normalizeRotation(value + 90);
}

export function pageWidthForLayout(
  availableWidth: number,
  pageLayout: PageLayout,
  gap = 22,
): number {
  if (availableWidth <= 0) return 1;
  return pageLayout === "spread"
    ? Math.max(1, (availableWidth - Math.max(0, gap)) / 2)
    : availableWidth;
}

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
  if (mode === "content") {
    if (pageWidth <= 0 || pageHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
      return 1;
    }
    return Math.min(availableWidth / pageWidth, availableHeight / pageHeight);
  }
  const pageLength = mode === "width" ? pageWidth : pageHeight;
  const availableLength = mode === "width" ? availableWidth : availableHeight;
  if (pageLength <= 0 || availableLength <= 0) return 1;
  return availableLength / pageLength;
}
