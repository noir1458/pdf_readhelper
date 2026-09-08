import { UserFacingError } from "../shared/errors";

export async function writePngToClipboard(blob: Blob): Promise<void> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    throw new UserFacingError("Image clipboard access is unavailable or was denied.", {
      cause: error,
    });
  }
}
