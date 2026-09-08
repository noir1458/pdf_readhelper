import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { extractPdfRange } from "../src/viewer/range-extractor";

describe("extractPdfRange", () => {
  it("copies exactly pages 2 through 11", async () => {
    const source = await PDFDocument.create();
    for (let page = 1; page <= 12; page += 1) source.addPage([500 + page, 700 + page]);
    const sourceBytes = await source.save();

    const outputBytes = await extractPdfRange(sourceBytes, { start: 2, end: 11 });
    const output = await PDFDocument.load(outputBytes);

    expect(output.getPageCount()).toBe(10);
    expect(output.getPage(0).getSize()).toEqual({ width: 502, height: 702 });
    expect(output.getPage(9).getSize()).toEqual({ width: 511, height: 711 });
  });

  it("copies one page for 1-1", async () => {
    const source = await PDFDocument.create();
    source.addPage();
    const output = await PDFDocument.load(await extractPdfRange(await source.save(), { start: 1, end: 1 }));
    expect(output.getPageCount()).toBe(1);
  });
});
