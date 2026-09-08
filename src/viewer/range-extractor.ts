import { PDFDocument } from "@cantoo/pdf-lib";
import { UserFacingError } from "../shared/errors";
import { pageIndices, type PageRange } from "../shared/range";

export async function extractPdfRange(bytes: Uint8Array, range: PageRange): Promise<Uint8Array> {
  try {
    const source = await PDFDocument.load(bytes);
    if (range.start < 1 || range.end > source.getPageCount() || range.end < range.start) {
      throw new UserFacingError(`Range must be between 1 and ${source.getPageCount()}.`);
    }
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, pageIndices(range));
    for (const page of pages) output.addPage(page);
    return await output.save();
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError(
      "Could not create the PDF. Encrypted, signed, form-heavy, or damaged PDFs may not extract correctly.",
      { cause: error },
    );
  }
}
