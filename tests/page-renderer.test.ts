import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSlot } from "../src/shared/types";
import { PageRenderer } from "../src/viewer/page-renderer";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const renderTasks: (Deferred<null> & { cancel: ReturnType<typeof vi.fn> })[] = [];
  const renderPage = vi.fn(() => {
    const pending = deferred<null>();
    const task = { ...pending, cancel: vi.fn() };
    renderTasks.push(task);
    return task as unknown as RenderTask;
  });
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      userUnit: 1,
    })),
    render: renderPage,
    streamTextContent: vi.fn(() => new ReadableStream()),
    getAnnotations: vi.fn(() => Promise.resolve([])),
    cleanup: vi.fn(),
  } as unknown as PDFPageProxy;
  const getPage = vi.fn(() => Promise.resolve(page));
  const document = { getPage } as unknown as PDFDocumentProxy;
  const slot = {
    pageNumber: 1,
    element: { style: { setProperty: vi.fn(), width: "" }, dataset: {} },
    canvas: {
      width: 0,
      height: 0,
      style: { width: "", height: "" },
      getContext: vi.fn(() => ({})),
    },
    textLayer: {
      replaceChildren: vi.fn(),
      style: { width: "", height: "" },
    },
    linkLayer: {
      replaceChildren: vi.fn(),
      style: { width: "", height: "" },
    },
    label: {},
  } as unknown as PageSlot;
  const createTextLayer = vi.fn(() => ({
    cancel: vi.fn(),
    render: vi.fn(() => Promise.resolve()),
    textDivs: [],
  }));
  return {
    document,
    getPage,
    page,
    renderPage,
    renderTasks,
    renderer: new PageRenderer(document, new Map([[1, slot]]), 1, createTextLayer),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("PageRenderer", () => {
  it("deduplicates a page before the asynchronous page lookup completes", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { getPage, page, renderPage, renderTasks, renderer } = fixture();
    const pageLookup = deferred<PDFPageProxy>();
    getPage.mockReturnValue(pageLookup.promise);

    const first = renderer.render(1);
    const duplicate = renderer.render(1);
    expect(getPage).toHaveBeenCalledTimes(1);

    pageLookup.resolve(page);
    await vi.waitFor(() => expect(renderTasks).toHaveLength(1));
    const renderTask = renderTasks[0];
    if (!renderTask) throw new Error("Expected a render task.");
    renderTask.resolve(null);
    await Promise.all([first, duplicate]);
    expect(renderPage).toHaveBeenCalledTimes(1);
  });

  it("waits for a cancelled render before reusing its canvas after zoom", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { renderPage, renderTasks, renderer } = fixture();

    const first = renderer.render(1);
    await vi.waitFor(() => expect(renderTasks).toHaveLength(1));
    renderer.setZoom(1.25);
    const replacement = renderer.render(1);
    expect(renderPage).toHaveBeenCalledTimes(1);
    const firstTask = renderTasks[0];
    if (!firstTask) throw new Error("Expected an initial render task.");
    expect(firstTask.cancel.mock.calls).toHaveLength(1);

    firstTask.resolve(null);
    await first;
    await vi.waitFor(() => expect(renderTasks).toHaveLength(2));
    const secondTask = renderTasks[1];
    if (!secondTask) throw new Error("Expected a replacement render task.");
    secondTask.resolve(null);
    await replacement;
    expect(renderPage).toHaveBeenCalledTimes(2);
  });
});
