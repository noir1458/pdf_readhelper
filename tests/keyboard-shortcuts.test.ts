import { describe, expect, it } from "vitest";
import { isPageCopyShortcut } from "../src/viewer/keyboard-shortcuts";

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
