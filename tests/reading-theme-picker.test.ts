import { describe, expect, it } from "vitest";
import {
  normalizeReadingTheme,
  readReadingTheme,
  READING_THEME_STORAGE_KEY,
} from "../src/ui/reading-theme-picker";

describe("reading theme persistence", () => {
  it("accepts supported themes and rejects unknown values", () => {
    expect(normalizeReadingTheme("original")).toBe("original");
    expect(normalizeReadingTheme("sepia")).toBe("sepia");
    expect(normalizeReadingTheme("dark")).toBe("dark");
    expect(normalizeReadingTheme("neon")).toBe("original");
    expect(normalizeReadingTheme(null)).toBe("original");
  });

  it("reads the saved theme from storage", () => {
    expect(
      readReadingTheme({
        getItem: (key) => (key === READING_THEME_STORAGE_KEY ? "sepia" : null),
      }),
    ).toBe("sepia");
  });

  it("falls back when storage is unavailable or throws", () => {
    expect(readReadingTheme(null)).toBe("original");
    expect(
      readReadingTheme({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("original");
  });
});
