export type ExtensionMessage = { type: "TRIGGER_COPY_PAGE"; targetTabId: number };

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "TRIGGER_COPY_PAGE") {
    return "targetTabId" in value && typeof value.targetTabId === "number";
  }
  return false;
}
