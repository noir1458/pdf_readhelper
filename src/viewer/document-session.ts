import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import {
  DEFAULT_VIEW_SCALE,
  PDF_CMAP_PATH,
  PDF_ICC_PATH,
  PDF_STANDARD_FONT_PATH,
  PDF_WASM_PATH,
  PDF_WORKER_PATH,
} from "../shared/constants";
import { UserFacingError } from "../shared/errors";
import type { DocumentSnapshot, PdfSource, ViewRotation } from "../shared/types";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(PDF_WORKER_PATH);

export class DocumentSession {
  #source: PdfSource | null = null;
  #originalBytes: Uint8Array | null = null;
  #loadingTask: PDFDocumentLoadingTask | null = null;
  #document: PDFDocumentProxy | null = null;
  #totalPages = 0;
  #currentPage = 1;
  #zoom = DEFAULT_VIEW_SCALE;
  #rotation: ViewRotation = 0;
  #status: DocumentSnapshot["status"] = "idle";
  #error: string | null = null;

  get snapshot(): DocumentSnapshot {
    return {
      source: this.#source,
      originalBytes: this.#originalBytes,
      loadingTask: this.#loadingTask,
      document: this.#document,
      totalPages: this.#totalPages,
      currentPage: this.#currentPage,
      zoom: this.#zoom,
      rotation: this.#rotation,
      status: this.#status,
      error: this.#error,
    };
  }

  async load(bytes: Uint8Array, source: PdfSource): Promise<PDFDocumentProxy> {
    await this.destroy();
    this.#status = "loading";
    this.#source = source;
    this.#originalBytes = bytes.slice();
    this.#error = null;
    this.#currentPage = 1;

    try {
      this.#loadingTask = getDocument({
        data: bytes,
        cMapUrl: chrome.runtime.getURL(PDF_CMAP_PATH),
        cMapPacked: true,
        standardFontDataUrl: chrome.runtime.getURL(PDF_STANDARD_FONT_PATH),
        wasmUrl: chrome.runtime.getURL(PDF_WASM_PATH),
        iccUrl: chrome.runtime.getURL(PDF_ICC_PATH),
        useWorkerFetch: true,
      });
      this.#document = await this.#loadingTask.promise;
      this.#totalPages = this.#document.numPages;
      this.#status = "ready";
      return this.#document;
    } catch (error) {
      this.#status = "error";
      this.#error = error instanceof Error ? error.message : "PDF loading failed.";
      throw error;
    }
  }

  requireDocument(): PDFDocumentProxy {
    if (!this.#document) throw new UserFacingError("Open a PDF first.");
    return this.#document;
  }

  requireBytes(): Uint8Array {
    if (!this.#originalBytes) throw new UserFacingError("Open a PDF first.");
    return this.#originalBytes;
  }

  setCurrentPage(pageNumber: number): void {
    if (pageNumber >= 1 && pageNumber <= this.#totalPages) this.#currentPage = pageNumber;
  }

  setZoom(zoom: number): void {
    this.#zoom = zoom;
  }

  setRotation(rotation: ViewRotation): void {
    this.#rotation = rotation;
  }

  async destroy(): Promise<void> {
    if (this.#loadingTask) {
      await this.#loadingTask.destroy().catch(() => undefined);
    }
    this.#loadingTask = null;
    this.#document = null;
    this.#originalBytes = null;
    this.#source = null;
    this.#totalPages = 0;
    this.#rotation = 0;
    this.#status = "idle";
    this.#error = null;
  }
}
