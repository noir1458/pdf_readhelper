import { UserFacingError } from "./errors";

export type PageRange = {
  start: number;
  end: number;
};

export function parsePageRange(input: string, totalPages?: number): PageRange {
  const normalized = input.trim();
  const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(normalized);
  if (!match) throw new UserFacingError("Enter a page or range such as 7 or 2-11.");

  const startText = match[1];
  if (!startText) throw new UserFacingError("Enter a valid page range.");
  const start = Number.parseInt(startText, 10);
  const end = Number.parseInt(match[2] ?? startText, 10);

  if (start < 1 || end < 1) throw new UserFacingError("Page numbers must start at 1.");
  if (end < start) throw new UserFacingError("The end page must not be before the start page.");
  if (totalPages !== undefined && end > totalPages) {
    throw new UserFacingError(`Range must be between 1 and ${totalPages}.`);
  }

  return { start, end };
}

export function pageIndices(range: PageRange): number[] {
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start - 1 + index);
}
