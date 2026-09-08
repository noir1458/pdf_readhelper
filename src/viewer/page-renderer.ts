import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { MAX_DISPLAY_PIXELS, RELEASE_RADIUS } from "../shared/constants";
import type { PageSlot } from "../shared/types";
import { canvasDimensions, limitedScale } from "./render-math";

type RenderJob = {
  generation: number;
  task: RenderTask | null;
  promise: Promise<void>;
};

export class PageRenderer {
  readonly #document: PDFDocumentProxy;
  readonly #slots: Map<number, PageSlot>;
  readonly #rendering = new Map<number, RenderJob>();
  readonly #renderedPages = new Map<number, PDFPageProxy>();
  #zoom: number;
  #generation = 0;
  #disposed = false;

  constructor(document: PDFDocumentProxy, slots: Map<number, PageSlot>, zoom: number) {
    this.#document = document;
    this.#slots = slots;
    this.#zoom = zoom;
  }

  setZoom(zoom: number): void {
    this.#zoom = zoom;
    this.releaseAll();
  }

  render(pageNumber: number): Promise<void> {
    if (this.#disposed || this.#renderedPages.has(pageNumber)) return Promise.resolve();
    const existingJob = this.#rendering.get(pageNumber);
    if (existingJob) {
      if (existingJob.generation === this.#generation) return existingJob.promise;
      return existingJob.promise.then(
        () => this.render(pageNumber),
        () => this.render(pageNumber),
      );
    }
    const slot = this.#slots.get(pageNumber);
    if (!slot) return Promise.resolve();

    const job: RenderJob = {
      generation: this.#generation,
      task: null,
      promise: Promise.resolve(),
    };
    job.promise = this.#renderPage(pageNumber, slot, job).finally(() => {
      if (this.#rendering.get(pageNumber) === job) this.#rendering.delete(pageNumber);
    });
    this.#rendering.set(pageNumber, job);
    return job.promise;
  }

  async #renderPage(pageNumber: number, slot: PageSlot, job: RenderJob): Promise<void> {
    let page: PDFPageProxy | null = null;
    let completed = false;
    try {
      page = await this.#document.getPage(pageNumber);
      if (!this.#isCurrent(job)) return;
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

      slot.element.style.setProperty(
        "--page-aspect",
        `${baseViewport.width} / ${baseViewport.height}`,
      );
      slot.element.style.width = `${cssViewport.width}px`;
      slot.canvas.width = dimensions.width;
      slot.canvas.height = dimensions.height;
      slot.canvas.style.width = `${cssViewport.width}px`;
      slot.canvas.style.height = `${cssViewport.height}px`;
      if (!slot.canvas.getContext("2d", { alpha: false })) {
        throw new Error("Canvas 2D context is unavailable.");
      }

      const task = page.render({ canvas: slot.canvas, viewport: renderViewport });
      job.task = task;
      await task.promise;
      if (!this.#isCurrent(job)) return;
      this.#renderedPages.set(pageNumber, page);
      slot.element.dataset.rendered = "true";
      completed = true;
    } catch (error) {
      if (this.#isCurrent(job)) throw error;
    } finally {
      if (page && !completed) page.cleanup();
    }
  }

  releaseDistant(currentPage: number): void {
    for (const [pageNumber, page] of this.#renderedPages) {
      if (Math.abs(pageNumber - currentPage) <= RELEASE_RADIUS) continue;
      this.#release(pageNumber, page);
    }
  }

  releaseAll(): void {
    this.#generation += 1;
    for (const job of this.#rendering.values()) job.task?.cancel();
    for (const [pageNumber, page] of this.#renderedPages) this.#release(pageNumber, page);
  }

  dispose(): void {
    this.#disposed = true;
    this.releaseAll();
  }

  #isCurrent(job: RenderJob): boolean {
    return !this.#disposed && job.generation === this.#generation;
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
