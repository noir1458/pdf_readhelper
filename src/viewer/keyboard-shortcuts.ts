type CopyShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

type ReadingNavigationEvent = CopyShortcutEvent;

export type ReadingNavigationAction =
  "viewport-forward" | "viewport-backward" | "document-start" | "document-end";

export function isPageCopyShortcut(event: CopyShortcutEvent): boolean {
  return (
    !event.defaultPrevented &&
    !event.repeat &&
    !event.altKey &&
    !event.shiftKey &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "c"
  );
}

export function readingNavigationAction(
  event: ReadingNavigationEvent,
): ReadingNavigationAction | null {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (event.key === " " || event.key === "Spacebar") {
    return event.shiftKey ? "viewport-backward" : "viewport-forward";
  }
  if (event.shiftKey) return null;

  switch (event.key) {
    case "PageDown":
      return "viewport-forward";
    case "PageUp":
      return "viewport-backward";
    case "Home":
      return "document-start";
    case "End":
      return "document-end";
    default:
      return null;
  }
}

export function readingScrollOffset(
  action: ReadingNavigationAction,
  viewportHeight: number,
): number | null {
  if (action !== "viewport-forward" && action !== "viewport-backward") return null;
  const distance = Math.max(1, Math.round(viewportHeight * 0.88));
  return action === "viewport-forward" ? distance : -distance;
}
