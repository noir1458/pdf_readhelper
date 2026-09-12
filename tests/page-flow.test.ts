import { describe, expect, it, vi } from "vitest";
import {
  normalizePageFlow,
  PAGE_FLOW_STORAGE_KEY,
  pageIndicatorText,
  pagedViewPages,
  pageTurnShortcutDirection,
  pageTurnTarget,
  readPageFlow,
  writePageFlow,
} from "../src/viewer/page-flow";

const keyEvent = (overrides: Partial<Parameters<typeof pageTurnShortcutDirection>[0]> = {}) => ({
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  key: "ArrowRight",
  metaKey: false,
  repeat: false,
  shiftKey: false,
  ...overrides,
});

describe("page flow", () => {
  it("normalizes and persists the viewer-wide flow preference", () => {
    expect(normalizePageFlow("paged")).toBe("paged");
    expect(normalizePageFlow("unknown")).toBe("continuous");
    expect(readPageFlow({ getItem: () => "paged" })).toBe("paged");
    const setItem = vi.fn();
    writePageFlow("continuous", { setItem });
    expect(setItem).toHaveBeenCalledWith(PAGE_FLOW_STORAGE_KEY, "continuous");
    expect(
      readPageFlow({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("continuous");
    expect(() =>
      writePageFlow("paged", {
        setItem: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });

  it("shows only the selected page in single-page mode", () => {
    expect(pagedViewPages(7, 20, "single")).toEqual([7]);
    expect(pagedViewPages(99, 20, "single")).toEqual([20]);
  });

  it("uses a cover-first pairing in spread mode", () => {
    expect(pagedViewPages(1, 8, "spread")).toEqual([1]);
    expect(pagedViewPages(2, 8, "spread")).toEqual([2, 3]);
    expect(pagedViewPages(3, 8, "spread")).toEqual([2, 3]);
    expect(pagedViewPages(8, 8, "spread")).toEqual([8]);
  });

  it("shows both visible spread pages in the page indicator", () => {
    expect(pageIndicatorText(1, 8, "spread")).toBe("1");
    expect(pageIndicatorText(2, 8, "spread")).toBe("2, 3");
    expect(pageIndicatorText(3, 8, "spread")).toBe("2, 3");
    expect(pageIndicatorText(4, 8, "single")).toBe("4");
  });

  it("turns by one page or one cover-first spread", () => {
    expect(pageTurnTarget(3, 8, "single", "next")).toBe(4);
    expect(pageTurnTarget(1, 8, "single", "previous")).toBeNull();
    expect(pageTurnTarget(1, 8, "spread", "next")).toBe(2);
    expect(pageTurnTarget(3, 8, "spread", "next")).toBe(4);
    expect(pageTurnTarget(4, 8, "spread", "previous")).toBe(2);
    expect(pageTurnTarget(2, 8, "spread", "previous")).toBe(1);
    expect(pageTurnTarget(8, 8, "spread", "next")).toBeNull();
  });

  it("uses only unmodified horizontal arrows while paged", () => {
    expect(pageTurnShortcutDirection(keyEvent(), "paged")).toBe("next");
    expect(pageTurnShortcutDirection(keyEvent({ key: "ArrowLeft" }), "paged")).toBe("previous");
    expect(pageTurnShortcutDirection(keyEvent(), "continuous")).toBeNull();
    expect(pageTurnShortcutDirection(keyEvent({ ctrlKey: true }), "paged")).toBeNull();
    expect(pageTurnShortcutDirection(keyEvent({ repeat: true }), "paged")).toBeNull();
  });
});
