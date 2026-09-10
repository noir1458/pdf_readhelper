import { writePngToClipboard } from "../clipboard/clipboard";
import { downloadBlob } from "../shared/download";
import { errorMessage, UserFacingError } from "../shared/errors";
import { originalPdfFilename, pageImageFilename, rangeFilename } from "../shared/filename";
import { isExtensionMessage } from "../shared/messages";
import { classifyPdfUrl, sourceUrlFromLocation } from "../shared/source";
import type { PageRange } from "../shared/range";
import type { PageSlot, PdfSource } from "../shared/types";
import { OPENAI_TRANSLATION_MODEL, translatePageImage } from "../translation/openai-translation";
import { TranslationCache, type CachedPageTranslation } from "../translation/translation-cache";
import { DocumentToolbar } from "../ui/document-toolbar";
import { ReadingThemePicker } from "../ui/reading-theme-picker";
import { TranslationPanel } from "../ui/translation-panel";
import { Toast } from "../ui/toast";
import { UrlPopover } from "../ui/url-popover";
import { DocumentSession } from "./document-session";
import { DocumentSidebar } from "./document-sidebar";
import { hasFileDragType } from "./drag-data";
import {
  isPageCopyShortcut,
  originalDocumentShortcutAction,
  readingNavigationAction,
  readingScrollOffset,
} from "./keyboard-shortcuts";
import { originalPdfBlob, printOriginalPdf } from "./original-document";
import {
  PageNavigationHistory,
  pageHistoryShortcutDirection,
  type PageHistoryDirection,
} from "./page-navigation-history";
import {
  extractBookmarkTitle,
  normalizeBookmarkNote,
  normalizeBookmarkTitle,
  pageBookmarkKey,
  PageBookmarkStore,
  sortPageBookmarks,
  type PageBookmark,
} from "./page-bookmarks";
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
import { destinationPageNumber } from "./pdf-destination";
import { namedActionPage, type PdfLinkTarget } from "./pdf-link-layer";
import { PdfDocumentSearch, type PdfSearchMatch } from "./pdf-search";
import { extractPdfRange } from "./range-extractor";
import {
  fittedScale,
  nextRotation,
  normalizeRotation,
  pageWidthForLayout,
  type FitMode,
} from "./render-math";
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
const rotateButton = requireElement<HTMLButtonElement>("#rotate-clockwise");
const pageLayoutButton = requireElement<HTMLButtonElement>("#toggle-page-layout");
const searchButton = requireElement<HTMLButtonElement>("#search-pdf");
const searchPopover = requireElement<HTMLElement>("#search-popover");
const searchInput = requireElement<HTMLInputElement>("#search-input");
const searchStatus = requireElement<HTMLElement>("#search-status");
const searchPrevious = requireElement<HTMLButtonElement>("#search-previous");
const searchNext = requireElement<HTMLButtonElement>("#search-next");
const downloadOriginalButton = requireElement<HTMLButtonElement>("#download-original");
const printOriginalButton = requireElement<HTMLButtonElement>("#print-original");
const bookmarkButton = requireElement<HTMLButtonElement>("#toggle-bookmark");
const historyBackButton = requireElement<HTMLButtonElement>("#history-back");
const historyForwardButton = requireElement<HTMLButtonElement>("#history-forward");
const toast = new Toast(requireElement<HTMLElement>("#toast"));
const tracker = new PageTracker(scroller, updateCurrentPage);
const documentLibrary = new DocumentLibrary();
const translationCache = new TranslationCache();
const bookmarkStore = new PageBookmarkStore();
const pageNavigationHistory = new PageNavigationHistory();
const slots = new Map<number, PageSlot>();
let renderer: PageRenderer | null = null;
let renderObserver: IntersectionObserver | null = null;
let dragDepth = 0;
let activeDocumentId: string | null = null;
let positionSaveTimer = 0;
let translationRequestController: AbortController | null = null;
let topbarCollapseTimer = 0;
let searchTimer = 0;
let documentSearch: PdfDocumentSearch | null = null;
let searchController: AbortController | null = null;
let searchMatches: PdfSearchMatch[] = [];
let activeSearchMatch = -1;
let currentBookmarks = new Map<number, PageBookmark>();
let bookmarkBusy = false;

const documentSidebar = new DocumentSidebar(
  {
    root: sidebar,
    thumbnailsTab: requireElement<HTMLButtonElement>("#thumbnails-tab"),
    outlineTab: requireElement<HTMLButtonElement>("#outline-tab"),
    documentsTab: requireElement<HTMLButtonElement>("#documents-tab"),
    bookmarksTab: requireElement<HTMLButtonElement>("#bookmarks-tab"),
    thumbnailsPanel: requireElement<HTMLElement>("#thumbnails-panel"),
    outlinePanel: requireElement<HTMLElement>("#outline-panel"),
    documentsPanel: requireElement<HTMLElement>("#documents-panel"),
    bookmarksPanel: requireElement<HTMLElement>("#bookmarks-panel"),
    thumbnailsList: requireElement<HTMLElement>("#thumbnails-list"),
    outlineList: requireElement<HTMLElement>("#outline-list"),
    documentsList: requireElement<HTMLElement>("#documents-list"),
    bookmarksList: requireElement<HTMLElement>("#bookmarks-list"),
  },
  {
    navigate: (pageNumber) => navigateToPage(pageNumber),
    openDocument: openSavedDocument,
    removeDocument: removeSavedDocument,
    reorderDocuments: reorderSavedDocuments,
    editBookmark,
    removeBookmark,
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

new ReadingThemePicker(
  requireElement<HTMLElement>("#theme-popover"),
  requireElement<HTMLButtonElement>("#reading-theme"),
  (theme) => {
    scroller.dataset.readingTheme = theme;
  },
);

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
rotateButton.addEventListener("click", rotateClockwise);
pageLayoutButton.addEventListener("click", togglePageLayout);
historyBackButton.addEventListener("click", () => navigatePageHistory("back"));
historyForwardButton.addEventListener("click", () => navigatePageHistory("forward"));
sidebarToggle.addEventListener("click", () => setSidebarOpen(sidebar.hasAttribute("hidden")));
pageInput.addEventListener("change", navigateFromInput);
pageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") navigateFromInput();
});
searchButton.addEventListener("click", toggleSearch);
requireElement<HTMLButtonElement>("#close-search").addEventListener("click", closeSearch);
searchPrevious.addEventListener("click", () => void moveSearchResult(-1));
searchNext.addEventListener("click", () => void moveSearchResult(1));
downloadOriginalButton.addEventListener("click", () => void downloadOriginal());
printOriginalButton.addEventListener("click", () => void printOriginal());
bookmarkButton.addEventListener("click", () => void toggleBookmark());
searchInput.addEventListener("input", scheduleSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (searchMatches.length > 0) void moveSearchResult(event.shiftKey ? -1 : 1);
  else void runSearch();
});
document.addEventListener("keydown", handlePageCopyShortcut);
document.addEventListener("keydown", handlePdfSearchShortcut);
document.addEventListener("keydown", handleReadingNavigationShortcut);
document.addEventListener("keydown", handlePageHistoryShortcut);
document.addEventListener("keydown", handleOriginalDocumentShortcut);
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
  searchController?.abort();
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
    if (tabId === message.targetTabId) void toolbar.copyCurrentPage();
  });
});

function handlePageCopyShortcut(event: KeyboardEvent): void {
  if (
    !session.snapshot.document ||
    !isPageCopyShortcut(event) ||
    shouldKeepNativeCopy(event.target)
  ) {
    return;
  }
  event.preventDefault();
  void toolbar.copyCurrentPage();
}

function handlePdfSearchShortcut(event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.shiftKey ||
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLowerCase() !== "f" ||
    !session.snapshot.document
  ) {
    if (event.key === "Escape" && !searchPopover.hidden) closeSearch();
    return;
  }
  event.preventDefault();
  openSearch();
}

function handleReadingNavigationShortcut(event: KeyboardEvent): void {
  const action = readingNavigationAction(event);
  if (!session.snapshot.document || !action || shouldKeepNativeReadingNavigation(event.target)) {
    return;
  }

  event.preventDefault();
  const offset = readingScrollOffset(action, scroller.clientHeight);
  if (offset !== null) {
    scroller.scrollBy({ top: offset, behavior: "smooth" });
    return;
  }
  navigateToPage(action === "document-start" ? 1 : session.snapshot.totalPages);
}

function handlePageHistoryShortcut(event: KeyboardEvent): void {
  const direction = pageHistoryShortcutDirection(event);
  if (
    !session.snapshot.document ||
    !direction ||
    shouldKeepNativePageHistoryShortcut(event.target) ||
    !canNavigatePageHistory(direction)
  ) {
    return;
  }
  event.preventDefault();
  navigatePageHistory(direction);
}

function handleOriginalDocumentShortcut(event: KeyboardEvent): void {
  const action = originalDocumentShortcutAction(event);
  if (!session.snapshot.document || !action) return;
  event.preventDefault();
  if (action === "download-original") void downloadOriginal();
  else void printOriginal();
}

function shouldKeepNativeCopy(target: EventTarget | null): boolean {
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    return true;
  }
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

function shouldKeepNativeReadingNavigation(target: EventTarget | null): boolean {
  if (
    target instanceof Element &&
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], .topbar, .document-sidebar, .translation-panel',
    )
  ) {
    return true;
  }
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

function shouldKeepNativePageHistoryShortcut(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

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
  resetSearch();
  resetBookmarks();
  pageNavigationHistory.clear();
  updatePageHistoryButtons();
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
  downloadOriginalButton.disabled = true;
  printOriginalButton.disabled = true;
  slots.clear();
  pageStack.replaceChildren();

  const pdfDocument = await session.load(bytes, source);
  updateRotationButton();
  updatePageLayout();
  documentSearch = new PdfDocumentSearch(pdfDocument);
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
  renderer = new PageRenderer(
    pdfDocument,
    slots,
    session.snapshot.zoom,
    undefined,
    (target) => void activatePdfLink(target),
  );
  observeRendering();
  tracker.observe([...slots.values()].map((slot) => slot.element));
  totalPages.textContent = String(pdfDocument.numPages);
  pageInput.max = String(pdfDocument.numPages);
  updateCurrentPage(1);
  activeDocumentId = libraryId;
  pageNavigationHistory.reset(initialPage);
  updatePageHistoryButtons();
  documentSidebar.setActiveDocument(libraryId);
  if (translationPanel.isOpen) void loadCachedTranslation(initialPage);
  toolbar.show(pdfDocument.numPages);
  scheduleTopbarCollapse();
  sidebarToggle.disabled = false;
  searchButton.disabled = false;
  downloadOriginalButton.disabled = false;
  printOriginalButton.disabled = false;
  documentSidebar.showPanel(options.keepDocumentsPanel ? "documents" : "thumbnails");
  void documentSidebar.setDocument(pdfDocument);
  setSidebarOpen(true);
  await loadBookmarks(libraryId);
  emptyState.hidden = true;
  document.title =
    source.kind === "local-file" ? `${source.name} — PDF Read Helper` : "PDF Read Helper";
  if (initialPage > 1) navigateToPage(initialPage, "auto", false);
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
    element.addEventListener("pointerdown", () => updateCurrentPage(pageNumber));
    element.addEventListener("focusin", () => updateCurrentPage(pageNumber));
    const canvas = document.createElement("canvas");
    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";
    textLayer.tabIndex = 0;
    const linkLayer = document.createElement("div");
    linkLayer.className = "pdf-link-layer";
    const label = document.createElement("span");
    label.className = "page-label";
    label.textContent = String(pageNumber);
    element.append(canvas, textLayer, linkLayer, label);
    fragment.append(element);
    slots.set(pageNumber, { pageNumber, element, canvas, textLayer, linkLayer, label });
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
  updateBookmarkButton();
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

function navigateToPage(
  target: number,
  behavior: ScrollBehavior = "smooth",
  recordHistory = true,
): boolean {
  const slot = slots.get(target);
  if (!Number.isInteger(target) || !slot) return false;
  if (recordHistory) {
    pageNavigationHistory.record(session.snapshot.currentPage, target);
    updatePageHistoryButtons();
  }
  slot.element.scrollIntoView({ behavior, block: "start" });
  updateCurrentPage(target);
  void renderNear(target);
  return true;
}

function navigatePageHistory(direction: PageHistoryDirection): void {
  const target = pageNavigationHistory.move(direction, session.snapshot.currentPage);
  if (target === null) return;
  navigateToPage(target, "auto", false);
  updatePageHistoryButtons();
}

function canNavigatePageHistory(direction: PageHistoryDirection): boolean {
  return direction === "back"
    ? pageNavigationHistory.canGoBack
    : pageNavigationHistory.canGoForward;
}

function updatePageHistoryButtons(): void {
  const hasDocument = Boolean(session.snapshot.document);
  historyBackButton.disabled = !hasDocument || !pageNavigationHistory.canGoBack;
  historyForwardButton.disabled = !hasDocument || !pageNavigationHistory.canGoForward;
}

async function activatePdfLink(target: PdfLinkTarget): Promise<void> {
  const document = session.snapshot.document;
  if (!document || target.kind === "external") return;
  try {
    const pageNumber =
      target.kind === "destination"
        ? await destinationPageNumber(document, target.destination)
        : namedActionPage(target.action, session.snapshot.currentPage, document.numPages);
    if (session.snapshot.document !== document) return;
    if (!pageNumber || !navigateToPage(pageNumber)) {
      throw new Error("Unsupported PDF link target");
    }
  } catch {
    if (session.snapshot.document === document) {
      toast.show("Could not open that PDF link.", "error");
    }
  }
}

function toggleSearch(): void {
  if (searchPopover.hidden) openSearch();
  else closeSearch();
}

function openSearch(): void {
  if (!documentSearch) return;
  showFullTopbar();
  searchPopover.hidden = false;
  searchButton.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    searchInput.focus();
    searchInput.select();
  });
  if (searchInput.value.trim() && searchMatches.length === 0) scheduleSearch();
}

function closeSearch(): void {
  window.clearTimeout(searchTimer);
  searchController?.abort();
  searchController = null;
  searchPopover.hidden = true;
  searchButton.setAttribute("aria-expanded", "false");
  searchMatches = [];
  activeSearchMatch = -1;
  renderer?.setSearchMatches([], -1);
  scroller.focus({ preventScroll: true });
  scheduleTopbarCollapse();
}

function resetSearch(): void {
  window.clearTimeout(searchTimer);
  searchController?.abort();
  searchController = null;
  documentSearch = null;
  searchMatches = [];
  activeSearchMatch = -1;
  searchInput.value = "";
  searchStatus.textContent = "Type to search";
  searchPrevious.disabled = true;
  searchNext.disabled = true;
  searchButton.disabled = true;
  searchPopover.hidden = true;
  searchButton.setAttribute("aria-expanded", "false");
}

function scheduleSearch(): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void runSearch(), 180);
}

async function runSearch(): Promise<void> {
  const search = documentSearch;
  const query = searchInput.value;
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  searchMatches = [];
  activeSearchMatch = -1;
  renderer?.setSearchMatches([], -1);
  searchPrevious.disabled = true;
  searchNext.disabled = true;

  if (!search || !query.trim()) {
    searchStatus.textContent = "Type to search";
    return;
  }

  searchStatus.textContent = `Searching 0 / ${session.snapshot.totalPages} pages…`;
  try {
    const matches = await search.search(query, controller.signal, (completed, total) => {
      if (searchController === controller) {
        searchStatus.textContent = `Searching ${completed} / ${total} pages…`;
      }
    });
    if (searchController !== controller || controller.signal.aborted) return;
    searchMatches = matches;
    if (matches.length === 0) {
      searchStatus.textContent = "No results";
      return;
    }
    const fromCurrentPage = matches.findIndex(
      (match) => match.pageNumber >= session.snapshot.currentPage,
    );
    activeSearchMatch = fromCurrentPage >= 0 ? fromCurrentPage : 0;
    searchPrevious.disabled = false;
    searchNext.disabled = false;
    await showActiveSearchMatch();
  } catch (error) {
    if (controller.signal.aborted) return;
    searchStatus.textContent = "Search failed";
    toast.show(`Could not search PDF: ${errorMessage(error)}`, "error");
  }
}

async function moveSearchResult(delta: number): Promise<void> {
  if (searchMatches.length === 0) return;
  activeSearchMatch = (activeSearchMatch + delta + searchMatches.length) % searchMatches.length;
  await showActiveSearchMatch();
}

async function showActiveSearchMatch(): Promise<void> {
  const match = searchMatches[activeSearchMatch];
  const activeRenderer = renderer;
  if (!match || !activeRenderer) return;
  searchStatus.textContent = `${activeSearchMatch + 1} / ${searchMatches.length} · page ${match.pageNumber}`;
  activeRenderer.setSearchMatches(searchMatches, activeSearchMatch);
  navigateToPage(match.pageNumber, "auto");
  await activeRenderer.render(match.pageNumber);
  if (renderer === activeRenderer && searchMatches[activeSearchMatch] === match) {
    activeRenderer.revealSearchMatch(match);
  }
}

function resetBookmarks(): void {
  currentBookmarks = new Map();
  bookmarkBusy = false;
  bookmarkButton.disabled = true;
  bookmarkButton.setAttribute("aria-pressed", "false");
  bookmarkButton.setAttribute("aria-label", "Bookmark current page");
  bookmarkButton.title = "Bookmark current page";
  documentSidebar.setBookmarks([]);
}

async function loadBookmarks(documentId: string): Promise<void> {
  bookmarkBusy = true;
  updateBookmarkButton();
  try {
    const bookmarks = await bookmarkStore.list(documentId);
    if (activeDocumentId !== documentId) return;
    currentBookmarks = new Map(bookmarks.map((bookmark) => [bookmark.pageNumber, bookmark]));
    documentSidebar.setBookmarks(bookmarks);
  } catch {
    if (activeDocumentId === documentId) {
      currentBookmarks = new Map();
      documentSidebar.setBookmarks([]);
      toast.show("The PDF is open, but its bookmarks could not be loaded.", "error", 5600);
    }
  } finally {
    if (activeDocumentId === documentId) {
      bookmarkBusy = false;
      updateBookmarkButton();
    }
  }
}

async function toggleBookmark(): Promise<void> {
  const documentId = activeDocumentId;
  const pdfDocument = session.snapshot.document;
  const pageNumber = session.snapshot.currentPage;
  if (!documentId || !pdfDocument || bookmarkBusy) return;

  bookmarkBusy = true;
  updateBookmarkButton();
  try {
    if (currentBookmarks.has(pageNumber)) {
      await bookmarkStore.remove(documentId, pageNumber);
      if (activeDocumentId === documentId) {
        currentBookmarks.delete(pageNumber);
        renderBookmarks();
        toast.show(`Removed bookmark for page ${pageNumber}`, "success");
      }
      return;
    }

    let title = `Page ${pageNumber}`;
    try {
      title = await extractBookmarkTitle(pdfDocument, pageNumber);
    } catch {
      // Textless or malformed page content still gets a useful page-number bookmark.
    }
    const bookmark: PageBookmark = {
      id: pageBookmarkKey(documentId, pageNumber),
      documentId,
      pageNumber,
      title,
      createdAt: Date.now(),
    };
    await bookmarkStore.put(bookmark);
    if (activeDocumentId === documentId) {
      currentBookmarks.set(pageNumber, bookmark);
      renderBookmarks();
      toast.show(`Bookmarked page ${pageNumber}`, "success");
    }
  } catch (error) {
    if (activeDocumentId === documentId) {
      toast.show(`Could not update bookmark: ${errorMessage(error)}`, "error", 5600);
    }
  } finally {
    if (activeDocumentId === documentId) {
      bookmarkBusy = false;
      updateBookmarkButton();
    }
  }
}

async function removeBookmark(pageNumber: number): Promise<void> {
  const documentId = activeDocumentId;
  if (!documentId) throw new UserFacingError("Open the bookmarked PDF first.");
  await bookmarkStore.remove(documentId, pageNumber);
  if (activeDocumentId !== documentId) return;
  currentBookmarks.delete(pageNumber);
  renderBookmarks();
  updateBookmarkButton();
  toast.show(`Removed bookmark for page ${pageNumber}`, "success");
}

async function editBookmark(pageNumber: number, title: string, note: string): Promise<void> {
  const documentId = activeDocumentId;
  const existing = currentBookmarks.get(pageNumber);
  if (!documentId || existing?.documentId !== documentId) {
    throw new UserFacingError("That bookmark is no longer available.");
  }

  const normalizedNote = normalizeBookmarkNote(note);
  const bookmark: PageBookmark = {
    ...existing,
    title: normalizeBookmarkTitle(title, pageNumber),
    updatedAt: Date.now(),
  };
  if (normalizedNote) bookmark.note = normalizedNote;
  else delete bookmark.note;

  await bookmarkStore.put(bookmark);
  if (activeDocumentId !== documentId) return;
  currentBookmarks.set(pageNumber, bookmark);
  renderBookmarks();
  toast.show(`Saved bookmark for page ${pageNumber}`, "success");
}

function renderBookmarks(): void {
  documentSidebar.setBookmarks(sortPageBookmarks([...currentBookmarks.values()]));
}

function updateBookmarkButton(): void {
  const canBookmark = Boolean(session.snapshot.document && activeDocumentId);
  const bookmarked = canBookmark && currentBookmarks.has(session.snapshot.currentPage);
  bookmarkButton.disabled = !canBookmark || bookmarkBusy;
  bookmarkButton.setAttribute("aria-pressed", String(bookmarked));
  const label = bookmarked ? "Remove current page bookmark" : "Bookmark current page";
  bookmarkButton.setAttribute("aria-label", label);
  bookmarkButton.title = label;
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
  await Promise.all([
    documentLibrary.remove(id),
    translationCache.removeDocument(id),
    bookmarkStore.removeDocument(id),
  ]);
  if (activeDocumentId === id) {
    activeDocumentId = null;
    currentBookmarks = new Map();
    documentSidebar.setBookmarks([]);
    updateBookmarkButton();
  }
  if (!activeDocumentId) translationPanel.showPage(session.snapshot.currentPage, null);
  await refreshDocumentLibrary();
  toast.show("Removed from saved documents", "success");
}

async function reorderSavedDocuments(ids: string[]): Promise<void> {
  await documentLibrary.reorder(ids);
  await refreshDocumentLibrary();
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
        ...(previous?.sortOrder === undefined ? {} : { sortOrder: previous.sortOrder }),
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
    const viewport = page.getViewport({
      scale: 1,
      rotation: normalizeRotation(page.rotate + session.snapshot.rotation),
    });
    const horizontalMargin = window.innerWidth <= 760 ? 24 : 56;
    const availableWidth = pageWidthForLayout(
      Math.max(120, scroller.clientWidth - horizontalMargin),
      session.snapshot.pageLayout,
    );
    const scale = fittedScale(
      viewport.width,
      viewport.height,
      availableWidth,
      Math.max(120, scroller.clientHeight - 48),
      mode,
    );
    setZoom(scale);
  } catch (error) {
    toast.show(`Could not fit page: ${errorMessage(error)}`, "error");
  }
}

function rotateClockwise(): void {
  if (!renderer) return;
  const rotation = nextRotation(session.snapshot.rotation);
  const pageNumber = session.snapshot.currentPage;
  session.setRotation(rotation);
  renderer.setRotation(rotation);
  updateRotationButton();
  void renderNear(pageNumber).then(() => {
    slots.get(pageNumber)?.element.scrollIntoView({ behavior: "auto", block: "start" });
  });
  toast.show(`Rotated to ${rotation}°`, "success");
}

function updateRotationButton(): void {
  const rotation = session.snapshot.rotation;
  rotateButton.title = `Rotate clockwise · current ${rotation}°`;
  rotateButton.setAttribute("aria-label", `Rotate clockwise, current rotation ${rotation} degrees`);
}

function togglePageLayout(): void {
  if (!renderer) return;
  const pageNumber = session.snapshot.currentPage;
  session.setPageLayout(session.snapshot.pageLayout === "single" ? "spread" : "single");
  updatePageLayout();
  window.requestAnimationFrame(() => {
    slots.get(pageNumber)?.element.scrollIntoView({ behavior: "auto", block: "start" });
  });
  toast.show(session.snapshot.pageLayout === "spread" ? "Two-page spread" : "Single-page layout");
}

function updatePageLayout(): void {
  const spread = session.snapshot.pageLayout === "spread";
  pageStack.dataset.layout = session.snapshot.pageLayout;
  pageStack.setAttribute(
    "aria-label",
    spread ? "PDF pages, two-page spread" : "PDF pages, single column",
  );
  pageLayoutButton.setAttribute("aria-pressed", String(spread));
  pageLayoutButton.title = spread ? "Use single-page layout" : "Use two-page spread";
  pageLayoutButton.setAttribute("aria-label", pageLayoutButton.title);
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
    if (topbar.matches(":hover") || topbar.querySelector(":focus-visible") || !searchPopover.hidden)
      return;
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
    const pageImage = await renderPagePng(pdfDocument, pageNumber, {
      rotation: session.snapshot.rotation,
    });
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
    const blob = await renderPagePng(session.requireDocument(), pageNumber, {
      rotation: session.snapshot.rotation,
    });
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

async function downloadOriginal(): Promise<void> {
  if (downloadOriginalButton.disabled) return;
  downloadOriginalButton.disabled = true;
  downloadOriginalButton.setAttribute("aria-busy", "true");
  try {
    const source = session.snapshot.source;
    if (!source) throw new UserFacingError("Open a PDF first.");
    const filename = originalPdfFilename(source);
    await downloadBlob(originalPdfBlob(session.requireBytes()), filename);
    toast.show(`Saved ${filename}`, "success");
  } catch (error) {
    toast.show(`Could not download original PDF: ${errorMessage(error)}`, "error", 6000);
  } finally {
    downloadOriginalButton.disabled = !session.snapshot.document;
    downloadOriginalButton.removeAttribute("aria-busy");
  }
}

async function printOriginal(): Promise<void> {
  if (printOriginalButton.disabled) return;
  printOriginalButton.disabled = true;
  printOriginalButton.setAttribute("aria-busy", "true");
  try {
    const result = await printOriginalPdf(
      originalPdfBlob(session.requireBytes()),
      session.snapshot.currentPage,
    );
    if (result === "native-viewer") {
      toast.show("Opened the original PDF in a new tab. Use the browser print button.", "success");
    }
  } catch (error) {
    toast.show(`Could not print original PDF: ${errorMessage(error)}`, "error", 6000);
  } finally {
    printOriginalButton.disabled = !session.snapshot.document;
    printOriginalButton.removeAttribute("aria-busy");
  }
}

function handleDragEnter(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
}

function handleDragOver(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDragLeave(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
}

function handleDrop(event: DragEvent): void {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const file = event.dataTransfer?.files[0];
  if (file) void openFile(file);
}

function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer && hasFileDragType(event.dataTransfer.types));
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
