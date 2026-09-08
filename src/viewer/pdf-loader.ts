import { UserFacingError } from "../shared/errors";
import type { PdfSource } from "../shared/types";

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) return false;
  return PDF_HEADER.every((byte, index) => bytes[index] === byte);
}

export async function loadLocalFile(file: File): Promise<{ bytes: Uint8Array; source: PdfSource }> {
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new UserFacingError("Choose a PDF file.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfHeader(bytes)) throw new UserFacingError("The selected file is not a valid PDF.");
  return { bytes, source: { kind: "local-file", name: file.name } };
}

export async function loadPdfUrl(
  source: Exclude<PdfSource, { kind: "local-file" }>,
): Promise<Uint8Array> {
  if (source.kind === "file-url") {
    const allowed = await chrome.extension.isAllowedFileSchemeAccess();
    if (!allowed) {
      throw new UserFacingError(
        "Enable “Allow access to file URLs” in this extension's Chrome details, then try again.",
      );
    }
  }

  let response: Response;
  try {
    response = await fetch(source.url, { credentials: "include" });
  } catch (error) {
    throw new UserFacingError(
      "Could not load the original PDF. Download it and open it with Read Helper.",
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new UserFacingError(`PDF request failed (${response.status}). Download it and open locally.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!hasPdfHeader(bytes)) {
    throw new UserFacingError("The URL did not return a PDF. It may require sign-in or block access.");
  }
  return bytes;
}
