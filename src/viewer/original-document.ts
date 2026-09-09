import { UserFacingError } from "../shared/errors";

const PRINT_LOAD_TIMEOUT_MS = 5_000;
const PRINT_START_DELAY_MS = 350;
const FALLBACK_URL_LIFETIME_MS = 5 * 60_000;

export type PrintOriginalResult = "dialog" | "native-viewer";

export function originalPdfBlob(bytes: Uint8Array): Blob {
  const buffer =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
  return new Blob([buffer], { type: "application/pdf" });
}

export async function printOriginalPdf(
  blob: Blob,
  pageNumber: number,
): Promise<PrintOriginalResult> {
  const objectUrl = URL.createObjectURL(blob);
  const url = `${objectUrl}#page=${pageNumber}`;
  if (await printInHiddenFrame(url)) {
    URL.revokeObjectURL(objectUrl);
    return "dialog";
  }

  try {
    await chrome.tabs.create({ url, active: true });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new UserFacingError("The original PDF could not be opened for printing.", {
      cause: error,
    });
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), FALLBACK_URL_LIFETIME_MS);
  return "native-viewer";
}

function printInHiddenFrame(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.className = "pdf-print-frame";
    frame.title = "Original PDF print document";
    let settled = false;
    let startTimer = 0;
    const timeout = window.setTimeout(() => finish(false), PRINT_LOAD_TIMEOUT_MS);

    const finish = (printed: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.clearTimeout(startTimer);
      frame.remove();
      resolve(printed);
    };

    frame.addEventListener(
      "load",
      () => {
        startTimer = window.setTimeout(() => {
          try {
            if (!frame.contentWindow) return finish(false);
            frame.contentWindow.focus();
            frame.contentWindow.print();
            finish(true);
          } catch {
            finish(false);
          }
        }, PRINT_START_DELAY_MS);
      },
      { once: true },
    );
    frame.addEventListener("error", () => finish(false), { once: true });
    frame.src = url;
    document.body.append(frame);
  });
}
