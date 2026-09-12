import type { CachedPageTranslation } from "./translation-cache";

export function formatTranslationExport(translations: readonly CachedPageTranslation[]): string {
  const pages = [...translations].sort((left, right) => left.pageNumber - right.pageNumber);
  if (pages.length === 0) return "";
  return `${pages
    .map(({ pageNumber, text }) => `Page ${pageNumber}\n\n${text.trim()}`)
    .join("\n\n──────────\n\n")}\n`;
}
