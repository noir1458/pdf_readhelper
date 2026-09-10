import type { PageLayout } from "../shared/types";

export const PAGE_FLOW_STORAGE_KEY = "pdf-read-helper-page-flow";
export const PAGE_FLOWS = ["continuous", "paged"] as const;

export type PageFlow = (typeof PAGE_FLOWS)[number];
export type PageTurnDirection = "previous" | "next";

type PageFlowStorage = Pick<Storage, "getItem" | "setItem">;
type PageTurnEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

export function normalizePageFlow(value: unknown): PageFlow {
  return typeof value === "string" && PAGE_FLOWS.includes(value as PageFlow)
    ? (value as PageFlow)
    : "continuous";
}

export function readPageFlow(
  storage: Pick<PageFlowStorage, "getItem"> | null = browserStorage(),
): PageFlow {
  if (!storage) return "continuous";
  try {
    return normalizePageFlow(storage.getItem(PAGE_FLOW_STORAGE_KEY));
  } catch {
    return "continuous";
  }
}

export function writePageFlow(
  flow: PageFlow,
  storage: Pick<PageFlowStorage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PAGE_FLOW_STORAGE_KEY, flow);
  } catch {
    // Persistence is optional; the active viewer still keeps the selected flow.
  }
}

export function pagedViewPages(
  currentPage: number,
  totalPages: number,
  layout: PageLayout,
): number[] {
  if (totalPages < 1) return [];
  const page = Math.min(totalPages, Math.max(1, currentPage));
  if (layout === "single" || page === 1) return [page];
  const spreadStart = page % 2 === 0 ? page : page - 1;
  return spreadStart + 1 <= totalPages ? [spreadStart, spreadStart + 1] : [spreadStart];
}

export function pageTurnTarget(
  currentPage: number,
  totalPages: number,
  layout: PageLayout,
  direction: PageTurnDirection,
): number | null {
  if (totalPages < 1) return null;
  const page = Math.min(totalPages, Math.max(1, currentPage));
  if (layout === "single") {
    const target = direction === "next" ? page + 1 : page - 1;
    return target >= 1 && target <= totalPages ? target : null;
  }

  const spreadStart = page === 1 ? 1 : page % 2 === 0 ? page : page - 1;
  if (direction === "previous") {
    if (spreadStart === 1) return null;
    return spreadStart === 2 ? 1 : spreadStart - 2;
  }
  const target = spreadStart === 1 ? 2 : spreadStart + 2;
  return target <= totalPages ? target : null;
}

export function pageTurnShortcutDirection(
  event: PageTurnEvent,
  flow: PageFlow,
): PageTurnDirection | null {
  if (
    flow !== "paged" ||
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return null;
  }
  if (event.key === "ArrowLeft") return "previous";
  if (event.key === "ArrowRight") return "next";
  return null;
}

function browserStorage(): PageFlowStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
