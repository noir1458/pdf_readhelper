import { AnnotationType, type PageViewport } from "pdfjs-dist";
import type { PdfDestination } from "./pdf-destination";

export type PdfLinkTarget =
  | { kind: "external"; url: string; title: string }
  | { kind: "destination"; destination: PdfDestination; title: string }
  | { kind: "action"; action: string; title: string };

export type PdfLinkRegion = {
  rect: [number, number, number, number];
  target: PdfLinkTarget;
};

type LinkAnnotation = {
  annotationType?: unknown;
  rect?: unknown;
  url?: unknown;
  dest?: unknown;
  action?: unknown;
  overlaidText?: unknown;
};

export function pdfLinkRegions(annotations: unknown[]): PdfLinkRegion[] {
  const regions: PdfLinkRegion[] = [];
  for (const value of annotations) {
    if (!value || typeof value !== "object") continue;
    const annotation = value as LinkAnnotation;
    if (annotation.annotationType !== AnnotationType.LINK) continue;
    const rect = pdfRectangle(annotation.rect);
    if (!rect) continue;

    const title = typeof annotation.overlaidText === "string" ? annotation.overlaidText : "";
    const externalUrl = safeExternalUrl(annotation.url);
    if (externalUrl) {
      regions.push({
        rect,
        target: { kind: "external", url: externalUrl, title: title || externalUrl },
      });
      continue;
    }
    if (typeof annotation.dest === "string" || Array.isArray(annotation.dest)) {
      regions.push({
        rect,
        target: {
          kind: "destination",
          destination: annotation.dest,
          title: title || "Go to PDF destination",
        },
      });
      continue;
    }
    if (typeof annotation.action === "string" && supportedNamedAction(annotation.action)) {
      regions.push({
        rect,
        target: { kind: "action", action: annotation.action, title: title || annotation.action },
      });
    }
  }
  return regions;
}

export function namedActionPage(
  action: string,
  currentPage: number,
  totalPages: number,
): number | null {
  if (action === "FirstPage") return 1;
  if (action === "LastPage") return totalPages;
  if (action === "NextPage") return Math.min(totalPages, currentPage + 1);
  if (action === "PrevPage") return Math.max(1, currentPage - 1);
  return null;
}

export function viewportLinkRectangle(
  viewport: Pick<PageViewport, "convertToViewportPoint">,
  rect: PdfLinkRegion["rect"],
): { left: number; top: number; width: number; height: number } {
  const first = viewport.convertToViewportPoint(rect[0], rect[1]) as unknown[];
  const second = viewport.convertToViewportPoint(rect[2], rect[3]) as unknown[];
  const firstX = finiteCoordinate(first[0]);
  const firstY = finiteCoordinate(first[1]);
  const secondX = finiteCoordinate(second[0]);
  const secondY = finiteCoordinate(second[1]);
  const left = Math.min(firstX, secondX);
  const top = Math.min(firstY, secondY);
  return {
    left,
    top,
    width: Math.abs(secondX - firstX),
    height: Math.abs(secondY - firstY),
  };
}

export function renderPdfLinkLayer(
  container: HTMLElement,
  viewport: Pick<PageViewport, "convertToViewportPoint">,
  regions: PdfLinkRegion[],
  activate: (target: PdfLinkTarget) => void,
): void {
  container.replaceChildren();
  if (regions.length === 0) return;
  const fragment = document.createDocumentFragment();

  for (const region of regions) {
    const box = viewportLinkRectangle(viewport, region.rect);
    if (box.width < 1 || box.height < 1) continue;
    const link = document.createElement("a");
    link.className = "pdf-link";
    link.title = region.target.title;
    link.setAttribute("aria-label", region.target.title);
    link.style.left = `${box.left}px`;
    link.style.top = `${box.top}px`;
    link.style.width = `${box.width}px`;
    link.style.height = `${box.height}px`;

    if (region.target.kind === "external") {
      link.href = region.target.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.href = "#";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        activate(region.target);
      });
    }
    fragment.append(link);
  }
  container.append(fragment);
}

function pdfRectangle(value: unknown): PdfLinkRegion["rect"] | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return null;
  return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])];
}

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function supportedNamedAction(action: string): boolean {
  return ["FirstPage", "LastPage", "NextPage", "PrevPage"].includes(action);
}

function finiteCoordinate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
