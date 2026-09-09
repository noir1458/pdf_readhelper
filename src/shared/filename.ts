import type { PageRange } from "./range";
import type { PdfSource } from "./types";

export function rangeFilename(range: PageRange): string {
  return range.start === range.end ? `${range.start}.pdf` : `${range.start}-${range.end}.pdf`;
}

export function pageImageFilename(pageNumber: number): string {
  return `page-${pageNumber}.png`;
}

export function originalPdfFilename(source: PdfSource): string {
  const sourceName = source.kind === "local-file" ? source.name : filenameFromUrl(source.url);
  const printableName = Array.from(sourceName, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  ).join("");
  const sanitized = printableName
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/^\.+$/, "")
    .trim();
  const filename = sanitized || "document.pdf";
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function filenameFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return decodeURIComponent(segment);
  } catch {
    return "document.pdf";
  }
}
