type CopyShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

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
