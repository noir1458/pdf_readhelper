import { UserFacingError } from "./errors";

export async function downloadBlob(blob: Blob, filename: string): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    return await chrome.downloads.download({ url, filename, saveAs: false });
  } catch (error) {
    throw new UserFacingError("The download could not be started.", { cause: error });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
