import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/shared/messages";

describe("extension messages", () => {
  it("accepts known messages", () =>
    expect(isExtensionMessage({ type: "TRIGGER_COPY_PAGE", targetTabId: 7 })).toBe(true));
  it("rejects unknown messages", () =>
    expect(isExtensionMessage({ type: "DELETE_PDF" })).toBe(false));
  it("rejects targeted commands without a tab id", () =>
    expect(isExtensionMessage({ type: "TRIGGER_COPY_PAGE" })).toBe(false));
});
