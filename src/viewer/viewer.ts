import { writePngToClipboard } from "../clipboard/clipboard";
import { downloadBlob } from "../shared/download";
import { errorMessage, UserFacingError } from "../shared/errors";
import { pageImageFilename, rangeFilename } from "../shared/filename";
import { isExtensionMessage } from "../shared/messages";
import { classifyPdfUrl, sourceUrlFromLocation } from "../shared/source";
import type { PageRange } from "../shared/range";
import type { PageSlot, PdfSource } from "../shared/types";
import { OPENAI_TRANSLATION_MODEL, translatePageImage } from "../translation/openai-translation";
import { TranslationCache, type CachedPageTranslation } from "../translation/translation-cache";
import { DocumentToolbar } from "../ui/document-toolbar";
import { TranslationPanel } from "../ui/translation-panel";
import { Toast } from "../ui/toast";
import { UrlPopover } from "../ui/url-popover";
import { DocumentSession } from "./document-session";
import { DocumentSidebar } from "./document-sidebar";
import {
  DocumentLibrary,
  documentLibraryId,
  documentLibraryTitle,
  renderLibraryThumbnail,
  type SavedDocumentSummary,
} from "./document-library";
import { loadLocalFile, loadPdfUrl } from "./pdf-loader";
import { renderPagePng } from "./page-exporter";
import { PageRenderer } from "./page-renderer";
import { PageTracker } from "./page-tracker";
import { extractPdfRange } from "./range-extractor";
import { fittedScale, type FitMode } from "./render-math";
import {
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  RENDER_RADIUS,
  VIEW_SCALE_STEP,
} from "../shared/constants";

const session = new DocumentSession();
const scroller = requireElement<HTMLElement>("#viewer-scroller");
const pageStack = requireElement<HTMLElement>("#page-stack");
const emptyState = requireElement<HTMLElement>("#empty-state");
const loadingState = requireElement<HTMLElement>("#loading-state");
const fileInput = requireElement<HTMLInputElement>("#file-input");
const urlInput = requireElement<HTMLInputElement>("#url-input");
const pageInput = requireElement<HTMLInputElement>("#page-input");
const totalPages = requireElement<HTMLElement>("#total-pages");
const dropOverlay = requireElement<HTMLElement>("#drop-overlay");
const topbar = requireElement<HTMLElement>(".topbar");
const topbarRevealZone = requireElement<HTMLElement>("#topbar-reveal-zone");
const sidebar = requireElement<HTMLElement>("#document-sidebar");
const sidebarToggle = requireElement<HTMLButtonElement>("#toggle-sidebar");
const toast = new Toast(requireElement<HTMLElement>("#toast"));
const tracker = new PageTracker(scroller, updateCurrentPage);
const documentLibrary = new DocumentLibrary();
const translationCache = new TranslationCache();
const slots = new Map<number, PageSlot>();
let renderer: PageRenderer | null = null;
let renderObserver: IntersectionObserver | null = null;
let dragDepth = 0;
let activeDocumentId: string | null = null;
let positionSaveTimer = 0;
let translationRequestController: AbortController | null = null;
let topbarCollapseTimer = 0;

const documentSidebar = new DocumentSidebar(
  {
    root: sidebar,
    thumbnailsTab: requireElement<HTMLButtonElement>("#thumbnails-tab"),
    outlineTab: requireElement<HTMLButtonElement>("#outline-tab"),
    documentsTab: requireElement<HTMLButtonElement>("#documents-tab"),
    thumbnailsPanel: requireElement<HTMLElement>("#thumbnails-panel"),
    outlinePanel: requireElement<HTMLElement>("#outline-panel"),
    documentsPanel: requireElement<HTMLElement>("#documents-panel"),
    thumbnailsList: requireElement<HTMLElement>("#thumbnails-list"),
    outlineList: requireElement<HTMLElement>("#outline-list"),
    documentsList: requireElement<HTMLElement>("#documents-list"),
  },
  {
    navigate: (pageNumber) => navigateToPage(pageNumber),
    openDocument: openSavedDocument,
    removeDocument: removeSavedDocument,
    reportError: (message) => toast.show(message, "error"),
  },
);

const toolbar = new DocumentToolbar(requireElement<HTMLElement>("#document-toolbar"), {
  copyPage,
  extractRange,
  toggleTranslation: toggleTranslationPanel,
});

const translationPanel = new TranslationPanel(requireElement<HTMLElement>("#translation-panel"), {
  translate: requestPageTranslation,
  reportError: (message) => toast.show(message, "error", 6500),
  openChanged: (open) => toolbar.setTranslationOpen(open),
});

new UrlPopover(
  requireElement<HTMLElement>("#url-popover"),
  requireElement<HTMLButtonElement>("#open-url"),
  openUrl,
);

for (const id of ["#open-file", "#empty-open-file"]) {
  requireElement<HTMLButtonElement>(id).addEventListener("click", () => fileInput.click());
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = "";
});
requireElement<HTMLButtonElement>("#zoom-in").addEventListener("click", () =>
  setZoom(session.snapshot.zoom + VIEW_SCALE_STEP),
);
requireElement<HTMLButtonElement>("#zoom-out").addEventListener("click", () =>
  setZoom(session.snapshot.zoom - VIEW_SCALE_STEP),
);
requireElement<HTMLButtonElement>("#fit-width").addEventListener(
  "click",
  () => void fitPage("width"),
);
requireElement<HTMLButtonElement>("#fit-height").addEventListener(
  "click",
  () => void fitPage("height"),
);
sidebarToggle.addEventListener("click", () => setSidebarOpen(sidebar.hasAttribute("hidden")));
pageInput.addEventListener("change", navigateFromInput);
pageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") navigateFromInput();
});
topbar.addEventListener("pointerenter", () => window.clearTimeout(topbarCollapseTimer));
topbar.addEventListener("pointerleave", scheduleTopbarCollapse);
topbar.addEventListener("focusin", (event) => {
  if (event.target instanceof Element && event.target.matches(":focus-visible")) showFullTopbar();
});
topbar.addEventListener("focusout", () => {
  window.requestAnimationFrame(() => {
    if (!topbar.matches(":focus-within")) scheduleTopbarCollapse();
  });
});
topbarRevealZone.addEventListener("pointerenter", showFullTopbar);

window.addEventListener("dragenter", handleDragEnter);
window.addEventListener("dragover", handleDragOver);
window.addEventListener("dragleave", handleDragLeave);
window.addEventListener("drop", handleDrop);
window.addEventListener("beforeunload", () => {
  translationRequestController?.abort();
  flushReadingPosition();
  tracker.disconnect();
  renderObserver?.disconnect();
  renderer?.dispose();
  documentSidebar.dispose();
  void session.destroy();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushReadingPosition();
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message)) return;
  void currentTabId().then((tabId) => {
    if (tabId === message.targetTabId) void copyPage();
  });
});

async function currentTabId(): Promise<number | undefined> {
  try {
    return (await chrome.tabs.getCurrent())?.id;
  } catch {
    return undefined;
  }
}

async function openFile(file: File): Promise<void> {
  await runLoad(async () => {
    const { bytes, source } = await loadLocalFile(file);
    await openBytes(bytes, source);
  });
}

async function openUrl(value: string): Promise<void> {
  await runLoad(async () => {
    const source = classifyPdfUrl(value);
    urlInput.value = source.url;
    const bytes = await loadPdfUrl(source);
    await openBytes(bytes, source);
  });
}

async function runLoad(operation: () => Promise<void>): Promise<void> {
  loadingState.hidden = false;
  emptyState.hidden = true;
  try {
    await operation();
  } catch (error) {
    if (!session.snapshot.document) emptyState.hidden = false;
    toast.show(errorMessage(error), "error", 6500);
  } finally {
    loadingState.hidden = true;
  }
}

type OpenDocumentOptions = {
  savedMetadata?: SavedDocumentSummary;
  keepDocumentsPanel?: boolean;
  persistBytes?: boolean;
};

async function openBytes(
  bytes: Uint8Array,
  source: PdfSource,
  options: OpenDocumentOptions = {},
): Promise<void> {
  translationRequestController?.abort();
  translationRequestController = null;
  flushReadingPosition();
  activeDocumentId = null;
  const previousRenderer = renderer;
  renderer = null;
  previousRenderer?.dispose();
  renderObserver?.disconnect();
  tracker.disconnect();
  documentSidebar.destroy();
  setSidebarOpen(false);
  sidebarToggle.disabled = true;
  slots.clear();
  pageStack.replaceChildren();

  const pdfDocument = await session.load(bytes, source);
  const libraryId = options.savedMetadata?.id ?? documentLibraryId(pdfDocument, source);
  let savedMetadata = options.savedMetadata;
  if (!savedMetadata) {
    try {
      savedMetadata = (await documentLibrary.getMetadata(libraryId)) ?? undefined;
    } catch {
      // Storage errors must not prevent the PDF itself from opening.
    }
  }
  const initialPage = Math.min(pdfDocument.numPages, Math.max(1, savedMetadata?.lastPage ?? 1));
  createSlots(pdfDocument.numPages);
  renderer = new PageRenderer(pdfDocument, slots, session.snapshot.zoom);
  observeRendering();
  tracker.observe([...slots.values()].map((slot) => slot.element));
  totalPages.textContent = String(pdfDocument.numPages);
  pageInput.max = String(pdfDocument.numPages);
  updateCurrentPage(1);
  activeDocumentId = libraryId;
  documentSidebar.setActiveDocument(libraryId);
  if (translationPanel.isOpen) void loadCachedTranslation(initialPage);
  toolbar.show(pdfDocument.numPages);
  scheduleTopbarCollapse();
  sidebarToggle.disabled = false;
  documentSidebar.showPanel(options.keepDocumentsPanel ? "documents" : "thumbnails");
  void documentSidebar.setDocument(pdfDocument);
  setSidebarOpen(true);
  emptyState.hidden = true;
  document.title =
    source.kind === "local-file" ? `${source.name} — PDF Read Helper` : "PDF Read Helper";
  if (initialPage > 1) navigateToPage(initialPage, "auto");
  await renderNear(initialPage);
  if (options.persistBytes === false) {
    void saveReadingPositionNow().then(refreshDocumentLibrary).catch(reportLibraryError);
  } else {
    const storedBytes = session.requireBytes().slice().buffer;
    void rememberDocument(pdfDocument, source, libraryId, initialPage, storedBytes, savedMetadata);
  }
  toast.show(
    `Opened ${pdfDocument.numPages} page${pdfDocument.numPages === 1 ? "" : "s"}`,
    "success",
  );
}

function createSlots(count: number): void {
  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const element = document.createElement("article");
    element.className = "page-slot";
    element.dataset.pageNumber = String(pageNumber);
    element.setAttribute("aria-label", `Page ${pageNumber}`);
    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = String(pageNumber);
    element.append(canvas, label);
    fragment.append(element);
    slots.set(pageNumber, { pageNumber, element, canvas, label });
  }
  pageStack.append(fragment);
}

function observeRendering(): void {
  renderObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (Number.isFinite(pageNumber)) void renderNear(pageNumber);
      }
    },
    { root: scroller, rootMargin: "100% 0px", threshold: 0.01 },
  );
  for (const slot of slots.values()) renderObserver.observe(slot.element);
}

async function renderNear(pageNumber: number): Promise<void> {
  const activeRenderer = renderer;
  if (!activeRenderer) return;
  const end = session.snapshot.totalPages;
  const pages: Promise<void>[] = [];
  for (
    let page = Math.max(1, pageNumber - RENDER_RADIUS);
    page <= Math.min(end, pageNumber + RENDER_RADIUS);
    page += 1
  ) {
    pages.push(activeRenderer.render(page));
  }
  const results = await Promise.allSettled(pages);
  if (renderer !== activeRenderer) return;
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected")
    toast.show(`Page render failed: ${errorMessage(failure.reason)}`, "error");
  activeRenderer.releaseDistant(session.snapshot.currentPage);
}

function updateCurrentPage(pageNumber: number): void {
  session.setCurrentPage(pageNumber);
  tracker.setCurrentPage(pageNumber);
  pageInput.value = String(pageNumber);
  toolbar.setCurrentPage(pageNumber);
  documentSidebar.setCurrentPage(pageNumber);
  scheduleReadingPositionSave(pageNumber);
  renderer?.releaseDistant(pageNumber);
  if (translationPanel.isOpen) void loadCachedTranslation(pageNumber);
}

function navigateFromInput(): void {
  const target = Number(pageInput.value);
  if (!navigateToPage(target)) {
    pageInput.value = String(session.snapshot.currentPage);
    toast.show(`Page must be between 1 and ${session.snapshot.totalPages}.`, "error");
  }
}

function navigateToPage(target: number, behavior: ScrollBehavior = "smooth"): boolean {
  const slot = slots.get(target);
  if (!Number.isInteger(target) || !slot) return false;
  slot.element.scrollIntoView({ behavior, block: "start" });
  updateCurrentPage(target);
  void renderNear(target);
  return true;
}

async function openSavedDocument(id: string): Promise<void> {
  const savedDocument = await documentLibrary.get(id);
  if (!savedDocument) throw new UserFacingError("That saved PDF is no longer available.");
  if (savedDocument.source.kind !== "local-file") urlInput.value = savedDocument.source.url;
  await runLoad(() =>
    openBytes(new Uint8Array(savedDocument.bytes.slice(0)), savedDocument.source, {
      savedMetadata: savedDocument,
      keepDocumentsPanel: true,
      persistBytes: false,
    }),
  );
}

async function removeSavedDocument(id: string): Promise<void> {
  await Promise.all([documentLibrary.remove(id), translationCache.removeDocument(id)]);
  if (activeDocumentId === id) activeDocumentId = null;
  if (!activeDocumentId) translationPanel.showPage(session.snapshot.currentPage, null);
  await refreshDocumentLibrary();
  toast.show("Removed from saved documents", "success");
}

async function rememberDocument(
  pdfDocument: ReturnType<DocumentSession["requireDocument"]>,
  source: PdfSource,
  id: string,
  initialPage: number,
  bytes: ArrayBuffer,
  previous?: SavedDocumentSummary,
): Promise<void> {
  try {
    let thumbnail = previous?.thumbnail ?? null;
    if (!thumbnail) {
      try {
        thumbnail = await renderLibraryThumbnail(pdfDocument);
      } catch {
        // A preview is optional; keep the PDF and reading position even if it cannot render.
      }
    }
    await documentLibrary.save(
      {
        id,
        title: previous?.title ?? documentLibraryTitle(source),
        source,
        thumbnail,
        lastPage: activeDocumentId === id ? session.snapshot.currentPage : initialPage,
        totalPages: pdfDocument.numPages,
        updatedAt: Date.now(),
      },
      bytes,
    );
    if (activeDocumentId === id) await saveReadingPositionNow();
    await refreshDocumentLibrary();
  } catch {
    reportLibraryError();
  }
}

async function refreshDocumentLibrary(): Promise<void> {
  const documents = await documentLibrary.list();
  documentSidebar.setDocuments(documents, activeDocumentId);
  if (!session.snapshot.document && documents.length > 0) {
    sidebarToggle.disabled = false;
    documentSidebar.showPanel("documents");
  }
}

function scheduleReadingPositionSave(pageNumber: number): void {
  if (!activeDocumentId) return;
  window.clearTimeout(positionSaveTimer);
  documentSidebar.updateDocumentPage(activeDocumentId, pageNumber, session.snapshot.totalPages);
  positionSaveTimer = window.setTimeout(() => {
    void saveReadingPositionNow().catch(reportLibraryError);
  }, 350);
}

async function saveReadingPositionNow(): Promise<void> {
  window.clearTimeout(positionSaveTimer);
  positionSaveTimer = 0;
  if (!activeDocumentId) return;
  await documentLibrary.updateLastPage(activeDocumentId, session.snapshot.currentPage);
}

function flushReadingPosition(): void {
  if (!activeDocumentId) return;
  void saveReadingPositionNow().catch(() => undefined);
}

function reportLibraryError(): void {
  toast.show("The PDF is open, but its saved-document entry could not be updated.", "error", 5600);
}

function setZoom(value: number): void {
  if (!renderer) return;
  const zoom = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, value));
  session.setZoom(zoom);
  renderer.setZoom(zoom);
  void renderNear(session.snapshot.currentPage);
}

async function fitPage(mode: FitMode): Promise<void> {
  if (!renderer) return;
  try {
    const page = await session.requireDocument().getPage(session.snapshot.currentPage);
    const viewport = page.getViewport({ scale: 1 });
    const horizontalMargin = window.innerWidth <= 760 ? 24 : 56;
    const scale = fittedScale(
      viewport.width,
      viewport.height,
      Math.max(120, scroller.clientWidth - horizontalMargin),
      Math.max(120, scroller.clientHeight - 48),
      mode,
    );
    setZoom(scale);
  } catch (error) {
    toast.show(`Could not fit page: ${errorMessage(error)}`, "error");
  }
}

function setSidebarOpen(open: boolean): void {
  sidebar.hidden = !open;
  sidebarToggle.setAttribute("aria-expanded", String(open));
  sidebarToggle.setAttribute("aria-label", open ? "Hide sidebar" : "Show sidebar");
  sidebarToggle.title = open ? "Hide sidebar" : "Show sidebar";
  if (open) documentSidebar.revealCurrentPage();
}

function scheduleTopbarCollapse(): void {
  window.clearTimeout(topbarCollapseTimer);
  if (!session.snapshot.document) return;
  topbarCollapseTimer = window.setTimeout(() => {
    if (topbar.matches(":hover") || topbar.querySelector(":focus-visible")) return;
    topbar.classList.add("is-compact");
  }, 450);
}

function showFullTopbar(): void {
  window.clearTimeout(topbarCollapseTimer);
  topbar.classList.remove("is-compact");
}

function toggleTranslationPanel(): void {
  if (translationPanel.isOpen) {
    translationPanel.close();
    return;
  }
  const pageNumber = session.snapshot.currentPage;
  translationPanel.open(pageNumber);
  void loadCachedTranslation(pageNumber);
}

async function loadCachedTranslation(pageNumber: number): Promise<void> {
  const documentId = activeDocumentId;
  translationPanel.showPage(pageNumber, null);
  if (!documentId) return;
  try {
    const translation = await translationCache.get(
      documentId,
      pageNumber,
      OPENAI_TRANSLATION_MODEL,
    );
    if (
      translationPanel.isOpen &&
      activeDocumentId === documentId &&
      session.snapshot.currentPage === pageNumber
    ) {
      translationPanel.showPage(pageNumber, translation);
    }
  } catch {
    toast.show("저장된 번역을 불러오지 못했습니다.", "error");
  }
}

async function requestPageTranslation(
  pageNumber: number,
  apiKey: string,
): Promise<CachedPageTranslation> {
  const documentId = activeDocumentId;
  if (!documentId) throw new UserFacingError("번역할 PDF가 열려 있지 않습니다.");
  const pdfDocument = session.requireDocument();
  translationRequestController?.abort();
  const controller = new AbortController();
  translationRequestController = controller;
  try {
    const pageImage = await renderPagePng(pdfDocument, pageNumber);
    const result = await translatePageImage(apiKey, pageImage, pageNumber, controller.signal);
    return await translationCache.put(
      documentId,
      pageNumber,
      OPENAI_TRANSLATION_MODEL,
      result.text,
      result.usage,
    );
  } finally {
    if (translationRequestController === controller) translationRequestController = null;
  }
}

async function copyPage(): Promise<void> {
  const pageNumber = session.snapshot.currentPage;
  try {
    const blob = await renderPagePng(session.requireDocument(), pageNumber);
    try {
      await writePngToClipboard(blob);
      toast.show(`Page ${pageNumber} copied`, "success");
    } catch (clipboardError) {
      try {
        await downloadBlob(blob, pageImageFilename(pageNumber));
        toast.show("Clipboard copy failed — PNG downloaded instead", "error", 5600);
      } catch (downloadError) {
        throw new UserFacingError(
          `Could not copy or download page: ${errorMessage(clipboardError)} ${errorMessage(downloadError)}`,
        );
      }
    }
  } catch (error) {
    toast.show(`Could not copy page: ${errorMessage(error)}`, "error", 6000);
  }
}

async function extractRange(range: PageRange): Promise<void> {
  try {
    const bytes = await extractPdfRange(session.requireBytes(), range);
    const filename = rangeFilename(range);
    const outputBuffer = new Uint8Array(bytes).buffer;
    await downloadBlob(new Blob([outputBuffer], { type: "application/pdf" }), filename);
    toast.show(`Saved ${filename}`, "success");
  } catch (error) {
    toast.show(errorMessage(error), "error", 6000);
  }
}

function handleDragEnter(event: DragEvent): void {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
}

function requireElement<T extends Element>(selector: string): T {
  // Generic inference preserves concrete DOM element APIs at each call site.
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing viewer element: ${selector}`);
  return element;
}

const initialUrl = sourceUrlFromLocation(window.location.search);
if (initialUrl) {
  urlInput.value = initialUrl;
  void openUrl(initialUrl);
}
void refreshDocumentLibrary().catch(() => undefined);
