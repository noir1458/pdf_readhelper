import type { PDFPageProxy } from "pdfjs-dist";
import { EXPORT_ANALYSIS_MAX_DIMENSION } from "../shared/constants";
import { UserFacingError } from "../shared/errors";
import type { ViewRotation } from "../shared/types";
import { detectContentBounds, scaleBounds, type PixelBounds } from "./content-bounds";
import { canvasDimensions, normalizeRotation } from "./render-math";

export type PageContentMeasurement = {
  pageWidth: number;
  pageHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  bounds: PixelBounds;
  usesFullPage: boolean;
};

export async function measurePageContent(
  page: PDFPageProxy,
  viewRotation: ViewRotation,
): Promise<PageContentMeasurement> {
  const rotation = normalizeRotation(page.rotate + viewRotation);
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const analysisScale = Math.min(
    1,
    EXPORT_ANALYSIS_MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height),
  );
  const analysisViewport = page.getViewport({ scale: analysisScale, rotation });
  const dimensions = canvasDimensions(baseViewport.width, baseViewport.height, analysisScale);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new UserFacingError("Canvas rendering is unavailable.");
    await page.render({ canvas, viewport: analysisViewport }).promise;
    const bounds = detectContentBounds(context.getImageData(0, 0, canvas.width, canvas.height));
    return {
      pageWidth: baseViewport.width,
      pageHeight: baseViewport.height,
      analysisWidth: canvas.width,
      analysisHeight: canvas.height,
      bounds,
      usesFullPage:
        bounds.x === 0 &&
        bounds.y === 0 &&
        bounds.width === canvas.width &&
        bounds.height === canvas.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function pageContentBox(measurement: PageContentMeasurement): PixelBounds {
  return scaleBounds(
    measurement.bounds,
    measurement.analysisWidth,
    measurement.analysisHeight,
    measurement.pageWidth,
    measurement.pageHeight,
  );
}

export function contentFittedScale(
  measurement: PageContentMeasurement,
  availableWidth: number,
  availableHeight: number,
): number {
  const bounds = pageContentBox(measurement);
  if (bounds.width <= 0 || bounds.height <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return 1;
  }
  return Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
}
