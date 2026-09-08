import type { PageRange } from "./range";

export function rangeFilename(range: PageRange): string {
  return range.start === range.end ? `${range.start}.pdf` : `${range.start}-${range.end}.pdf`;
}

export function pageImageFilename(pageNumber: number): string {
  return `page-${pageNumber}.png`;
}
