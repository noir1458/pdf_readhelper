import { describe, expect, it } from "vitest";
import {
  isPageCopyShortcut,
  readingNavigationAction,
  readingScrollOffset,
} from "../src/viewer/keyboard-shortcuts";

const event = (overrides: Partial<Parameters<typeof isPageCopyShortcut>[0]> = {}) => ({
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  key: "c",
  metaKey: false,
  repeat: false,
  shiftKey: false,
  ...overrides,
});

describe("page copy shortcut", () => {
  it("accepts Ctrl+C and Command+C", () => {
    expect(isPageCopyShortcut(event({ ctrlKey: true }))).toBe(true);
    expect(isPageCopyShortcut(event({ key: "C", metaKey: true }))).toBe(true);
  });

  it("ignores modified, repeated, and already handled key events", () => {
    expect(isPageCopyShortcut(event({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPageCopyShortcut(event({ ctrlKey: true, repeat: true }))).toBe(false);
    expect(isPageCopyShortcut(event({ ctrlKey: true, defaultPrevented: true }))).toBe(false);
  });
});

describe("reading navigation shortcut", () => {
  it("maps Space and page keys to viewport navigation", () => {
    expect(readingNavigationAction(event({ key: " " }))).toBe("viewport-forward");
    expect(readingNavigationAction(event({ key: " ", shiftKey: true }))).toBe("viewport-backward");
    expect(readingNavigationAction(event({ key: "PageDown" }))).toBe("viewport-forward");
    expect(readingNavigationAction(event({ key: "PageUp" }))).toBe("viewport-backward");
  });

  it("maps Home and End to document boundaries", () => {
    expect(readingNavigationAction(event({ key: "Home" }))).toBe("document-start");
    expect(readingNavigationAction(event({ key: "End" }))).toBe("document-end");
  });

  it("ignores browser modifiers, repeats, and already handled events", () => {
    expect(readingNavigationAction(event({ key: "PageDown", ctrlKey: true }))).toBeNull();
    expect(readingNavigationAction(event({ key: "PageUp", altKey: true }))).toBeNull();
    expect(readingNavigationAction(event({ key: "Home", shiftKey: true }))).toBeNull();
    expect(readingNavigationAction(event({ key: "End", repeat: true }))).toBeNull();
    expect(readingNavigationAction(event({ key: " ", defaultPrevented: true }))).toBeNull();
  });

  it("scrolls by most of one viewport while preserving reading overlap", () => {
    expect(readingScrollOffset("viewport-forward", 1000)).toBe(880);
    expect(readingScrollOffset("viewport-backward", 1000)).toBe(-880);
    expect(readingScrollOffset("document-start", 1000)).toBeNull();
  });
});
