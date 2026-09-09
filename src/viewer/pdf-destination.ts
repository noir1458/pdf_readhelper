import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfDestination = string | unknown[];

export async function destinationPageNumber(
  document: PDFDocumentProxy,
  destination: PdfDestination,
): Promise<number> {
  const resolved: unknown[] | null =
    typeof destination === "string"
      ? ((await document.getDestination(destination)) as unknown[] | null)
      : destination;
  if (!resolved || resolved.length === 0) throw new Error("Missing PDF destination");

  const target = resolved[0];
  if (typeof target === "number") return target + 1;
  if (isPageReference(target)) return (await document.getPageIndex(target)) + 1;
  throw new Error("Unsupported PDF destination");
}

function isPageReference(value: unknown): value is { num: number; gen: number } {
  if (!value || typeof value !== "object") return false;
  return (
    "num" in value &&
    "gen" in value &&
    typeof value.num === "number" &&
    typeof value.gen === "number"
  );
}
