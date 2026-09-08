import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { MAX_DISPLAY_PIXELS, RELEASE_RADIUS } from "../shared/constants";
import type { PageSlot } from "../shared/types";
import { canvasDimensions, limitedScale } from "./render-math";

export class PageRenderer {
  readonly #document: PDFDocumentProxy;
  readonly #slots: Map<number, PageSlot>;
  readonly #rendering = new Map<number, RenderTask>();
  readonly #renderedPages = new Map<number, PDFPageProxy>();
  #zoom: number;

  constructor(document: PDFDocumentProxy, slots: Map<number, PageSlot>, zoom: number) {
    this.#document = document;
    this.#slots = slots;
    this.#zoom = zoom;
  }

  setZoom(zoom: number): void {
    this.#zoom = zoom;
    this.releaseAll();
  }

  async render(pageNumber: number): Promise<void> {
    if (this.#renderedPages.has(pageNumber) || this.#rendering.has(pageNumber)) return;
    const slot = this.#slots.get(pageNumber);
    if (!slot) return;

    const page = await this.#document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const cssViewport = page.getViewport({ scale: this.#zoom });
    const outputScale = limitedScale(
      baseViewport.width,
      baseViewport.height,
      this.#zoom * devicePixelRatio,
      MAX_DISPLAY_PIXELS,
    );
    const renderViewport = page.getViewport({ scale: outputScale });
    const dimensions = canvasDimensions(baseViewport.width, baseViewport.height, outputScale);

    slot.element.style.setProperty("--page-aspect", `${baseViewport.width} / ${baseViewport.height}`);
    slot.element.style.width = `${cssViewport.width}px`;
    slot.canvas.width = dimensions.width;
    slot.canvas.height = dimensions.height;
    slot.canvas.style.width = `${cssViewport.width}px`;
    slot.canvas.style.height = `${cssViewport.height}px`;
    if (!slot.canvas.getContext("2d", { alpha: false })) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    const task = page.render({ canvas: slot.canvas, viewport: renderViewport });
    this.#rendering.set(pageNumber, task);
    try {
      await task.promise;
      this.#renderedPages.set(pageNumber, page);
      slot.element.dataset.rendered = "true";
    } finally {
      this.#rendering.delete(pageNumber);
    }
  }

  releaseDistant(currentPage: number): void {
    for (const [pageNumber, page] of this.#renderedPages) {
      if (Math.abs(pageNumber - currentPage) <= RELEASE_RADIUS) continue;
      this.#release(pageNumber, page);
    }
  }

  releaseAll(): void {
    for (const task of this.#rendering.values()) task.cancel();
    this.#rendering.clear();
    for (const [pageNumber, page] of this.#renderedPages) this.#release(pageNumber, page);
  }

  #release(pageNumber: number, page: PDFPageProxy): void {
    const slot = this.#slots.get(pageNumber);
    if (slot) {
      slot.canvas.width = 0;
      slot.canvas.height = 0;
      delete slot.element.dataset.rendered;
    }
    page.cleanup();
    this.#renderedPages.delete(pageNumber);
  }
}
