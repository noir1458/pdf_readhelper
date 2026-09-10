import { describe, expect, it } from "vitest";
import {
  PageNavigationHistory,
  pageHistoryShortcutDirection,
} from "../src/viewer/page-navigation-history";

describe("page navigation history", () => {
  it("moves backward and forward through explicit page jumps", () => {
    const history = new PageNavigationHistory();
    history.reset(1);
    history.record(1, 12);
    history.record(12, 40);

    expect(history.canGoBack).toBe(true);
    expect(history.canGoForward).toBe(false);
    expect(history.move("back", 40)).toBe(12);
    expect(history.move("back", 12)).toBe(1);
    expect(history.canGoBack).toBe(false);
    expect(history.move("forward", 1)).toBe(12);
    expect(history.move("forward", 12)).toBe(40);
  });

  it("captures the actual page reached by scrolling before leaving it", () => {
    const history = new PageNavigationHistory();
    history.reset(1);
    history.record(1, 10);
    history.record(15, 100);

    expect(history.move("back", 100)).toBe(15);
    expect(history.move("forward", 18)).toBe(100);
    expect(history.move("back", 100)).toBe(18);
  });

  it("drops the forward branch after a new jump", () => {
    const history = new PageNavigationHistory();
    history.reset(1);
    history.record(1, 10);
    history.record(10, 20);
    expect(history.move("back", 20)).toBe(10);

    history.record(10, 30);

    expect(history.canGoForward).toBe(false);
    expect(history.move("back", 30)).toBe(10);
    expect(history.move("back", 10)).toBe(1);
  });

  it("ignores same-page jumps and resets between documents", () => {
    const history = new PageNavigationHistory();
    history.reset(8);
    history.record(8, 8);
    expect(history.canGoBack).toBe(false);

    history.record(8, 20);
    history.reset(3);
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
  });

  it("recognizes only unmodified Alt plus horizontal arrows", () => {
    const event = {
      altKey: true,
      ctrlKey: false,
      defaultPrevented: false,
      key: "ArrowLeft",
      metaKey: false,
      repeat: false,
      shiftKey: false,
    };
    expect(pageHistoryShortcutDirection(event)).toBe("back");
    expect(pageHistoryShortcutDirection({ ...event, key: "ArrowRight" })).toBe("forward");
    expect(pageHistoryShortcutDirection({ ...event, altKey: false })).toBeNull();
    expect(pageHistoryShortcutDirection({ ...event, ctrlKey: true })).toBeNull();
    expect(pageHistoryShortcutDirection({ ...event, repeat: true })).toBeNull();
  });
});
