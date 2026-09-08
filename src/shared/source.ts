import { UserFacingError } from "./errors";
import type { PdfSource } from "./types";

export function classifyPdfUrl(value: string): Exclude<PdfSource, { kind: "local-file" }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UserFacingError("Enter a valid http, https, or file PDF URL.");
  }

  if (url.protocol === "file:") return { kind: "file-url", url: url.href };
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { kind: "remote-url", url: url.href };
  }
  throw new UserFacingError("Only http, https, and file PDF URLs are supported.");
}

export function viewerUrl(sourceUrl?: string): string {
  const url = new URL(chrome.runtime.getURL("src/viewer/viewer.html"));
  if (sourceUrl) url.searchParams.set("url", sourceUrl);
  return url.href;
}

export function sourceUrlFromLocation(search: string): string | null {
  const value = new URLSearchParams(search).get("url");
  return value?.trim() ? value : null;
}

export function looksLikePdfUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:", "file:"].includes(url.protocol)) return false;
    return decodeURIComponent(url.pathname).toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}
