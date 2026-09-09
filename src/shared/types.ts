import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

export type ViewRotation = 0 | 90 | 180 | 270;
export type PageLayout = "single" | "spread";

export type PdfSource =
  | { kind: "local-file"; name: string }
  | { kind: "remote-url"; url: string }
  | { kind: "file-url"; url: string };

export type DocumentSnapshot = {
  source: PdfSource | null;
  originalBytes: Uint8Array | null;
  loadingTask: PDFDocumentLoadingTask | null;
  document: PDFDocumentProxy | null;
  totalPages: number;
  currentPage: number;
  zoom: number;
  rotation: ViewRotation;
  pageLayout: PageLayout;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export type PageSlot = {
  pageNumber: number;
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  textLayer: HTMLDivElement;
  linkLayer: HTMLDivElement;
  label: HTMLElement;
};
