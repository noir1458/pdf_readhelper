import { describe, expect, it } from "vitest";
import {
  focusModeShortcutAction,
  isPageCopyShortcut,
  originalDocumentShortcutAction,
  readingNavigationAction,
  readingScrollOffset,
  translationShortcutAction,
} from "../src/viewer/keyboard-shortcuts";

const event = (overrides: Partial<Parameters<typeof translationShortcutAction>[0]> = {}) => ({
  altKey: false,
  code: "KeyC",
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

describe("original document shortcuts", () => {
  it("maps Ctrl/Command+S and Ctrl/Command+P", () => {
    expect(originalDocumentShortcutAction(event({ key: "s", ctrlKey: true }))).toBe(
      "download-original",
    );
    expect(originalDocumentShortcutAction(event({ key: "P", metaKey: true }))).toBe(
      "print-original",
    );
  });

  it("ignores modified, repeated, and already handled events", () => {
    expect(
      originalDocumentShortcutAction(event({ key: "s", ctrlKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      originalDocumentShortcutAction(event({ key: "p", metaKey: true, repeat: true })),
    ).toBeNull();
    expect(
      originalDocumentShortcutAction(event({ key: "p", ctrlKey: true, defaultPrevented: true })),
    ).toBeNull();
  });
});

describe("focus mode shortcut", () => {
  it("toggles with an unmodified F key and exits with Escape while active", () => {
    expect(focusModeShortcutAction(event({ key: "f" }), false)).toBe("toggle");
    expect(focusModeShortcutAction(event({ key: "F" }), false)).toBe("toggle");
    expect(focusModeShortcutAction(event({ key: "Escape" }), true)).toBe("exit");
    expect(focusModeShortcutAction(event({ key: "Escape" }), false)).toBeNull();
  });

  it("preserves modified, repeated, and already handled keys", () => {
    expect(focusModeShortcutAction(event({ key: "f", ctrlKey: true }), false)).toBeNull();
    expect(focusModeShortcutAction(event({ key: "f", shiftKey: true }), false)).toBeNull();
    expect(focusModeShortcutAction(event({ key: "f", repeat: true }), false)).toBeNull();
    expect(focusModeShortcutAction(event({ key: "f", defaultPrevented: true }), false)).toBeNull();
  });
});

describe("translation shortcuts", () => {
  it("maps T to panel toggle and Shift+T to translation", () => {
    expect(translationShortcutAction(event({ code: "KeyT", key: "t" }))).toBe("toggle-panel");
    expect(translationShortcutAction(event({ code: "KeyT", key: "T" }))).toBe("toggle-panel");
    expect(translationShortcutAction(event({ code: "KeyT", key: "ㅅ" }))).toBe("toggle-panel");
    expect(translationShortcutAction(event({ code: "KeyT", key: "t", shiftKey: true }))).toBe(
      "translate",
    );
  });

  it("preserves modified, repeated, and already handled keys", () => {
    expect(translationShortcutAction(event({ code: "KeyT", key: "t", ctrlKey: true }))).toBeNull();
    expect(translationShortcutAction(event({ code: "KeyT", key: "t", altKey: true }))).toBeNull();
    expect(translationShortcutAction(event({ code: "KeyT", key: "t", repeat: true }))).toBeNull();
    expect(
      translationShortcutAction(event({ code: "KeyT", key: "t", defaultPrevented: true })),
    ).toBeNull();
  });
});
