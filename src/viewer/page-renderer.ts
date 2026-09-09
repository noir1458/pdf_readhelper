import { TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "pdfjs-dist";
import { MAX_DISPLAY_PIXELS, RELEASE_RADIUS } from "../shared/constants";
import type { PageSlot } from "../shared/types";
import type { PdfSearchMatch, SearchTextRange } from "./pdf-search";
import { canvasDimensions, limitedScale } from "./render-math";

type RenderJob = {
  generation: number;
  task: RenderTask | null;
  textLayer: TextLayerHandle | null;
  promise: Promise<void>;
};

type RenderedPage = {
  page: PDFPageProxy;
  textLayer: TextLayerHandle | null;
};

type TextLayerHandle = Pick<TextLayer, "cancel" | "render" | "textDivs">;
type TextLayerFactory = (options: ConstructorParameters<typeof TextLayer>[0]) => TextLayerHandle;

export class PageRenderer {
  readonly #document: PDFDocumentProxy;
  readonly #slots: Map<number, PageSlot>;
  readonly #createTextLayer: TextLayerFactory;
  readonly #rendering = new Map<number, RenderJob>();
  readonly #renderedPages = new Map<number, RenderedPage>();
  #searchMatches: PdfSearchMatch[] = [];
  #activeSearchMatch = -1;
  #zoom: number;
  #generation = 0;
  #disposed = false;

  constructor(
    document: PDFDocumentProxy,
    slots: Map<number, PageSlot>,
    zoom: number,
    createTextLayer: TextLayerFactory = (options) => new TextLayer(options),
  ) {
    this.#document = document;
    this.#slots = slots;
    this.#zoom = zoom;
    this.#createTextLayer = createTextLayer;
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
      textLayer: null,
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

      slot.textLayer.replaceChildren();
      slot.textLayer.style.width = `${cssViewport.width}px`;
      slot.textLayer.style.height = `${cssViewport.height}px`;
      slot.element.style.setProperty(
        "--total-scale-factor",
        String(cssViewport.scale * cssViewport.userUnit),
      );
      const textLayer = this.#createTextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: slot.textLayer,
        viewport: cssViewport,
      });
      job.textLayer = textLayer;
      await textLayer.render();
      if (!this.#isCurrent(job)) return;

      this.#renderedPages.set(pageNumber, { page, textLayer });
      slot.element.dataset.rendered = "true";
      this.#refreshSearchHighlights();
      completed = true;
    } catch (error) {
      if (this.#isCurrent(job)) throw error;
    } finally {
      if (page && !completed) page.cleanup();
    }
  }

  releaseDistant(currentPage: number): void {
    for (const [pageNumber, rendered] of this.#renderedPages) {
      if (Math.abs(pageNumber - currentPage) <= RELEASE_RADIUS) continue;
      this.#release(pageNumber, rendered);
    }
  }

  releaseAll(): void {
    this.#generation += 1;
    for (const job of this.#rendering.values()) {
      job.task?.cancel();
      job.textLayer?.cancel();
    }
    for (const [pageNumber, rendered] of this.#renderedPages) this.#release(pageNumber, rendered);
  }

  dispose(): void {
    this.#disposed = true;
    this.releaseAll();
    const css = globalThis.CSS as typeof CSS | undefined;
    if (!css) return;
    css.highlights.delete("pdf-search-hit");
    css.highlights.delete("pdf-search-current");
  }

  setSearchMatches(matches: PdfSearchMatch[], activeIndex: number): void {
    this.#searchMatches = matches;
    this.#activeSearchMatch = activeIndex;
    this.#refreshSearchHighlights();
  }

  revealSearchMatch(match: PdfSearchMatch): void {
    const rendered = this.#renderedPages.get(match.pageNumber);
    const firstRange = match.ranges[0];
    const target = firstRange ? rendered?.textLayer?.textDivs[firstRange.itemIndex] : null;
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  #isCurrent(job: RenderJob): boolean {
    return !this.#disposed && job.generation === this.#generation;
  }

  #release(pageNumber: number, rendered: RenderedPage): void {
    const slot = this.#slots.get(pageNumber);
    if (slot) {
      slot.canvas.width = 0;
      slot.canvas.height = 0;
      slot.textLayer.replaceChildren();
      delete slot.element.dataset.rendered;
    }
    rendered.textLayer?.cancel();
    rendered.page.cleanup();
    this.#renderedPages.delete(pageNumber);
    this.#refreshSearchHighlights();
  }

  #refreshSearchHighlights(): void {
    const css = globalThis.CSS as typeof CSS | undefined;
    const HighlightConstructor = globalThis.Highlight as typeof Highlight | undefined;
    if (!css?.highlights || !HighlightConstructor) return;
    const hits: Range[] = [];
    const current: Range[] = [];
    for (const [matchIndex, match] of this.#searchMatches.entries()) {
      const textLayer = this.#renderedPages.get(match.pageNumber)?.textLayer;
      if (!textLayer) continue;
      const targetRanges = matchIndex === this.#activeSearchMatch ? current : hits;
      for (const range of match.ranges) {
        const domRange = textRange(textLayer.textDivs, range);
        if (domRange) targetRanges.push(domRange);
      }
    }
    css.highlights.set("pdf-search-hit", new HighlightConstructor(...hits));
    css.highlights.set("pdf-search-current", new HighlightConstructor(...current));
  }
}

function textRange(textDivs: HTMLElement[], match: SearchTextRange): Range | null {
  const textNode = textDivs[match.itemIndex]?.firstChild;
  if (textNode?.nodeType !== Node.TEXT_NODE) return null;
  const textLength = textNode.textContent?.length ?? 0;
  const start = Math.min(textLength, Math.max(0, match.start));
  const end = Math.min(textLength, Math.max(start, match.end));
  if (end <= start) return null;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  return range;
}
