import { describe, expect, it, vi } from "vitest";
import { FocusMode } from "../src/ui/focus-mode";

function createHarness(requestFails = false) {
  const documentListeners = new Map<string, EventListener>();
  const buttonListeners = new Map<string, EventListener>();
  const attributes = new Map<string, string>();
  const documentElement = {
    requestFullscreen: vi.fn(() => {
      if (requestFails) return Promise.reject(new Error("fullscreen denied"));
      fakeDocument.fullscreenElement = documentElement as unknown as Element;
      return Promise.resolve();
    }),
  };
  const fakeDocument = {
    documentElement,
    fullscreenElement: null as Element | null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      documentListeners.set(type, listener as EventListener);
    },
    removeEventListener: (type: string) => documentListeners.delete(type),
    exitFullscreen: vi.fn(() => {
      fakeDocument.fullscreenElement = null;
      return Promise.resolve();
    }),
  };
  const root = {
    dataset: {} as DOMStringMap,
    ownerDocument: fakeDocument,
  };
  const button = {
    disabled: true,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      buttonListeners.set(type, listener as EventListener);
    },
    removeEventListener: (type: string) => buttonListeners.delete(type),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    title: "",
  };
  const changed = vi.fn();
  const fullscreenFailed = vi.fn();
  const mode = new FocusMode(
    root as unknown as HTMLElement,
    button as unknown as HTMLButtonElement,
    {
      changed,
      fullscreenFailed,
    },
  );

  return {
    attributes,
    button,
    changed,
    documentElement,
    documentListeners,
    fakeDocument,
    fullscreenFailed,
    mode,
    root,
  };
}

describe("focus mode", () => {
  it("enters browser fullscreen and restores the viewer on exit", async () => {
    const harness = createHarness();
    harness.mode.setAvailable(true);

    await harness.mode.enter();
    expect(harness.mode.isActive).toBe(true);
    expect(harness.root.dataset.focusMode).toBe("true");
    expect(harness.attributes.get("aria-pressed")).toBe("true");
    expect(harness.documentElement.requestFullscreen).toHaveBeenCalledWith({
      navigationUI: "hide",
    });

    await harness.mode.exit();
    expect(harness.mode.isActive).toBe(false);
    expect(harness.root.dataset.focusMode).toBeUndefined();
    expect(harness.fakeDocument.exitFullscreen).toHaveBeenCalledOnce();
    expect(harness.changed.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps in-page focus mode active when fullscreen is denied", async () => {
    const harness = createHarness(true);

    await harness.mode.enter();

    expect(harness.mode.isActive).toBe(true);
    expect(harness.fullscreenFailed).toHaveBeenCalledOnce();
    expect(harness.root.dataset.focusMode).toBe("true");
  });

  it("restores viewer chrome when the browser leaves fullscreen", async () => {
    const harness = createHarness();
    await harness.mode.enter();
    harness.fakeDocument.fullscreenElement = null;

    harness.documentListeners.get("fullscreenchange")?.({} as Event);

    expect(harness.mode.isActive).toBe(false);
    expect(harness.root.dataset.focusMode).toBeUndefined();
    expect(harness.attributes.get("aria-pressed")).toBe("false");
  });

  it("closes fullscreen when a cancelled entry request resolves late", async () => {
    const harness = createHarness();
    let resolveRequest = () => undefined;
    harness.documentElement.requestFullscreen.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = () => {
            harness.fakeDocument.fullscreenElement = harness.documentElement as unknown as Element;
            resolve();
          };
        }),
    );

    const entering = harness.mode.enter();
    await harness.mode.exit();
    resolveRequest();
    await entering;

    expect(harness.mode.isActive).toBe(false);
    expect(harness.fakeDocument.exitFullscreen).toHaveBeenCalledOnce();
  });
});
