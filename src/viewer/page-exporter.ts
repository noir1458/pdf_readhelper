import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  DEFAULT_EXPORT_SCALE,
  EXPORT_ANALYSIS_MAX_DIMENSION,
  EXPORT_OUTPUT_SCALE_RATIO,
  MAX_EXPORT_PIXELS,
} from "../shared/constants";
import { UserFacingError } from "../shared/errors";
import type { ViewRotation } from "../shared/types";
import { detectContentBounds, scaleBounds } from "./content-bounds";
import { canvasDimensions, limitedScale, normalizeRotation } from "./render-math";

type PagePngOptions = {
  requestedScale?: number;
  rotation?: ViewRotation;
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new UserFacingError("Could not create a PNG from this page."));
    }, "image/png");
  });
}

export async function renderPagePng(
  document: PDFDocumentProxy,
  pageNumber: number,
  options: PagePngOptions = {},
): Promise<Blob> {
  const { requestedScale = DEFAULT_EXPORT_SCALE, rotation: viewRotation = 0 } = options;
  const page = await document.getPage(pageNumber);
  const rotation = normalizeRotation(page.rotate + viewRotation);
  const base = page.getViewport({ scale: 1, rotation });
  const analysisScale = Math.min(
    1,
    EXPORT_ANALYSIS_MAX_DIMENSION / Math.max(base.width, base.height),
  );
  const analysisViewport = page.getViewport({ scale: analysisScale, rotation });
  const analysisDimensions = canvasDimensions(base.width, base.height, analysisScale);
  const analysisCanvas = documentOwnerCanvas();
  const sourceCanvas = documentOwnerCanvas();
  const outputCanvas = documentOwnerCanvas();

  try {
    analysisCanvas.width = analysisDimensions.width;
    analysisCanvas.height = analysisDimensions.height;
    const analysisContext = canvasContext(analysisCanvas);
    await page.render({ canvas: analysisCanvas, viewport: analysisViewport }).promise;
    const detectedBounds = detectContentBounds(
      analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height),
    );

    const scale = limitedScale(base.width, base.height, requestedScale, MAX_EXPORT_PIXELS);
    const viewport = page.getViewport({ scale, rotation });
    const dimensions = canvasDimensions(base.width, base.height, scale);
    sourceCanvas.width = dimensions.width;
    sourceCanvas.height = dimensions.height;
    canvasContext(sourceCanvas);
    await page.render({ canvas: sourceCanvas, viewport }).promise;

    const crop = scaleBounds(
      detectedBounds,
      analysisCanvas.width,
      analysisCanvas.height,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    outputCanvas.width = Math.max(1, Math.round(crop.width * EXPORT_OUTPUT_SCALE_RATIO));
    outputCanvas.height = Math.max(1, Math.round(crop.height * EXPORT_OUTPUT_SCALE_RATIO));
    const outputContext = canvasContext(outputCanvas);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(
      sourceCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputCanvas.width,
      outputCanvas.height,
    );
    return await canvasToBlob(outputCanvas);
  } finally {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    outputCanvas.width = 0;
    outputCanvas.height = 0;
    page.cleanup();
  }
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new UserFacingError("Canvas rendering is unavailable.");
  return context;
}

function documentOwnerCanvas(): HTMLCanvasElement {
  return globalThis.document.createElement("canvas");
}
