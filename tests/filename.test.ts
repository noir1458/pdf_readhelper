import { describe, expect, it } from "vitest";
import { rangeFilename } from "../src/shared/filename";

describe("rangeFilename", () => {
  it("uses a single page name", () => expect(rangeFilename({ start: 7, end: 7 })).toBe("7.pdf"));
  it("uses an inclusive range name", () => expect(rangeFilename({ start: 2, end: 11 })).toBe("2-11.pdf"));
});
