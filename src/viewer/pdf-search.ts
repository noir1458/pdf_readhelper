import type { PDFDocumentProxy } from "pdfjs-dist";

type SearchTextContent = {
  items: ({ str: string } | { type: string })[];
};

export type SearchTextRange = {
  itemIndex: number;
  start: number;
  end: number;
};

export type PdfSearchMatch = {
  pageNumber: number;
  ranges: SearchTextRange[];
};

type IndexedTextSegment = SearchTextRange & {
  pageStart: number;
  pageEnd: number;
};

export type PageSearchIndex = {
  text: string;
  segments: IndexedTextSegment[];
};

export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function createPageSearchIndex(content: SearchTextContent): PageSearchIndex {
  let text = "";
  let itemIndex = 0;
  const segments: IndexedTextSegment[] = [];

  for (const item of content.items) {
    if (!("str" in item)) continue;
    if (text) text += " ";
    const pageStart = text.length;
    text += item.str;
    segments.push({
      itemIndex,
      start: 0,
      end: item.str.length,
      pageStart,
      pageEnd: text.length,
    });
    itemIndex += 1;
  }

  return { text: text.toLocaleLowerCase(), segments };
}

export function findPageMatches(index: PageSearchIndex, query: string): SearchTextRange[][] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return [];

  const matches: SearchTextRange[][] = [];
  let offset = 0;
  while ((offset = index.text.indexOf(normalizedQuery, offset)) !== -1) {
    const matchEnd = offset + normalizedQuery.length;
    const ranges = index.segments
      .filter((segment) => segment.pageEnd > offset && segment.pageStart < matchEnd)
      .map((segment) => ({
        itemIndex: segment.itemIndex,
        start: Math.max(0, offset - segment.pageStart),
        end: Math.min(segment.end, matchEnd - segment.pageStart),
      }))
      .filter((range) => range.end > range.start);
    if (ranges.length > 0) matches.push(ranges);
    offset = matchEnd;
  }
  return matches;
}

export class PdfDocumentSearch {
  readonly #document: PDFDocumentProxy;
  readonly #pageIndexes = new Map<number, Promise<PageSearchIndex>>();

  constructor(document: PDFDocumentProxy) {
    this.#document = document;
  }

  async search(
    query: string,
    signal?: AbortSignal,
    onProgress?: (completedPages: number, totalPages: number) => void,
  ): Promise<PdfSearchMatch[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return [];

    const matches: PdfSearchMatch[][] = Array.from({ length: this.#document.numPages }, () => []);
    let nextPage = 1;
    let completedPages = 0;
    const workerCount = Math.min(4, this.#document.numPages);

    const worker = async (): Promise<void> => {
      while (nextPage <= this.#document.numPages) {
        throwIfAborted(signal);
        const pageNumber = nextPage;
        nextPage += 1;
        const index = await this.#getPageIndex(pageNumber);
        throwIfAborted(signal);
        matches[pageNumber - 1] = findPageMatches(index, normalizedQuery).map((ranges) => ({
          pageNumber,
          ranges,
        }));
        completedPages += 1;
        onProgress?.(completedPages, this.#document.numPages);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    return matches.flat();
  }

  #getPageIndex(pageNumber: number): Promise<PageSearchIndex> {
    const cached = this.#pageIndexes.get(pageNumber);
    if (cached) return cached;

    const pending = this.#document
      .getPage(pageNumber)
      .then((page) =>
        page.getTextContent({ includeMarkedContent: true, disableNormalization: true }),
      )
      .then(createPageSearchIndex)
      .catch((error: unknown) => {
        this.#pageIndexes.delete(pageNumber);
        throw error;
      });
    this.#pageIndexes.set(pageNumber, pending);
    return pending;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("PDF search was cancelled.", "AbortError");
}
