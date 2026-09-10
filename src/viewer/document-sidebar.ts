import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { canvasDimensions, limitedScale } from "./render-math";
import type { SavedDocumentSummary } from "./document-library";
import { destinationPageNumber } from "./pdf-destination";
import {
  MAX_BOOKMARK_NOTE_LENGTH,
  MAX_BOOKMARK_TITLE_LENGTH,
  type PageBookmark,
} from "./page-bookmarks";

type OutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineItem[];
};

type SidebarElements = {
  root: HTMLElement;
  thumbnailsTab: HTMLButtonElement;
  outlineTab: HTMLButtonElement;
  documentsTab: HTMLButtonElement;
  bookmarksTab: HTMLButtonElement;
  thumbnailsPanel: HTMLElement;
  outlinePanel: HTMLElement;
  documentsPanel: HTMLElement;
  bookmarksPanel: HTMLElement;
  thumbnailsList: HTMLElement;
  outlineList: HTMLElement;
  documentsList: HTMLElement;
  bookmarksList: HTMLElement;
};

type SidebarOptions = {
  navigate: (pageNumber: number) => void;
  openDocument: (id: string) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  reorderDocuments: (ids: string[]) => Promise<void>;
  editBookmark: (pageNumber: number, title: string, note: string) => Promise<void>;
  removeBookmark: (pageNumber: number) => Promise<void>;
  reportError: (message: string) => void;
};

const THUMBNAIL_CSS_WIDTH = 144;
const MAX_THUMBNAIL_PIXELS = 1_500_000;

export class DocumentSidebar {
  readonly #elements: SidebarElements;
  readonly #navigate: SidebarOptions["navigate"];
  readonly #reportError: SidebarOptions["reportError"];
  readonly #openDocument: SidebarOptions["openDocument"];
  readonly #removeDocument: SidebarOptions["removeDocument"];
  readonly #reorderDocuments: SidebarOptions["reorderDocuments"];
  readonly #editBookmark: SidebarOptions["editBookmark"];
  readonly #removeBookmark: SidebarOptions["removeBookmark"];
  readonly #thumbnailButtons = new Map<number, HTMLButtonElement>();
  readonly #documentButtons = new Map<string, HTMLButtonElement>();
  readonly #bookmarkButtons = new Map<number, HTMLButtonElement>();
  readonly #documentObjectUrls: string[] = [];
  readonly #renderTasks = new Map<number, RenderTask>();
  readonly #requestedThumbnails = new Map<number, PDFDocumentProxy>();
  #document: PDFDocumentProxy | null = null;
  #thumbnailObserver: IntersectionObserver | null = null;
  #currentPage = 1;
  #bookmarks: PageBookmark[] = [];
  #draggedDocumentId: string | null = null;

  constructor(elements: SidebarElements, options: SidebarOptions) {
    this.#elements = elements;
    this.#navigate = options.navigate;
    this.#openDocument = options.openDocument;
    this.#removeDocument = options.removeDocument;
    this.#reorderDocuments = options.reorderDocuments;
    this.#editBookmark = options.editBookmark;
    this.#removeBookmark = options.removeBookmark;
    this.#reportError = options.reportError;
    elements.thumbnailsTab.addEventListener("click", () => this.showPanel("thumbnails"));
    elements.outlineTab.addEventListener("click", () => this.showPanel("outline"));
    elements.documentsTab.addEventListener("click", () => this.showPanel("documents"));
    elements.bookmarksTab.addEventListener("click", () => this.showPanel("bookmarks"));
    elements.documentsList.addEventListener("dragover", this.#dragDocumentOver);
    elements.documentsList.addEventListener("drop", this.#dropDocument);
  }

  async setDocument(document: PDFDocumentProxy): Promise<void> {
    this.destroy();
    this.#document = document;
    this.#currentPage = 1;
    this.#createThumbnailSlots(document.numPages);
    this.#observeThumbnails(document);
    this.setCurrentPage(1);
    this.#elements.outlineList.replaceChildren(this.#status("Loading table of contents…"));

    try {
      const outline = (await document.getOutline()) as OutlineItem[];
      if (this.#document !== document) return;
      this.#renderOutline(document, outline);
    } catch {
      if (this.#document === document) {
        this.#elements.outlineList.replaceChildren(
          this.#status("Could not read the table of contents."),
        );
      }
    }
  }

  showPanel(panel: "thumbnails" | "outline" | "documents" | "bookmarks"): void {
    const showThumbnails = panel === "thumbnails";
    const showOutline = panel === "outline";
    const showDocuments = panel === "documents";
    const showBookmarks = panel === "bookmarks";
    this.#elements.thumbnailsPanel.hidden = !showThumbnails;
    this.#elements.outlinePanel.hidden = !showOutline;
    this.#elements.documentsPanel.hidden = !showDocuments;
    this.#elements.bookmarksPanel.hidden = !showBookmarks;
    this.#elements.thumbnailsTab.setAttribute("aria-selected", String(showThumbnails));
    this.#elements.outlineTab.setAttribute("aria-selected", String(showOutline));
    this.#elements.documentsTab.setAttribute("aria-selected", String(showDocuments));
    this.#elements.bookmarksTab.setAttribute("aria-selected", String(showBookmarks));
    if (showThumbnails) this.#scrollCurrentThumbnailIntoView();
  }

  setDocuments(documents: SavedDocumentSummary[], activeId: string | null): void {
    for (const objectUrl of this.#documentObjectUrls) URL.revokeObjectURL(objectUrl);
    this.#documentObjectUrls.length = 0;
    this.#documentButtons.clear();
    this.#elements.documentsList.replaceChildren();
    if (documents.length === 0) {
      this.#elements.documentsList.append(
        this.#status("Opened PDFs will appear here with their last-read page."),
      );
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const savedDocument of documents) {
      const row = document.createElement("article");
      row.className = "saved-document";
      row.dataset.documentId = savedDocument.id;

      const dragHandle = document.createElement("span");
      dragHandle.className = "saved-document-drag";
      dragHandle.textContent = "⠿";
      dragHandle.title = `Drag to reorder ${savedDocument.title}`;
      dragHandle.setAttribute("aria-label", `Drag to reorder ${savedDocument.title}`);
      dragHandle.draggable = true;
      dragHandle.addEventListener("dragstart", (event) => {
        this.#draggedDocumentId = savedDocument.id;
        row.classList.add("is-dragging");
        this.#elements.documentsList.classList.add("is-reordering");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", savedDocument.id);
        }
      });
      dragHandle.addEventListener("dragend", () => this.#finishDocumentDrag());

      const openButton = document.createElement("button");
      openButton.className = "saved-document-open";
      openButton.type = "button";
      openButton.title = savedDocument.title;
      openButton.setAttribute("aria-label", `Open ${savedDocument.title}`);
      if (savedDocument.id === activeId) openButton.setAttribute("aria-current", "true");

      const preview = document.createElement("span");
      preview.className = "saved-document-preview";
      if (savedDocument.thumbnail) {
        const objectUrl = URL.createObjectURL(savedDocument.thumbnail);
        this.#documentObjectUrls.push(objectUrl);
        const image = document.createElement("img");
        image.src = objectUrl;
        image.alt = "";
        preview.append(image);
      } else {
        preview.textContent = "PDF";
      }

      const details = document.createElement("span");
      details.className = "saved-document-details";
      const title = document.createElement("span");
      title.className = "saved-document-title";
      title.textContent = savedDocument.title;
      const position = document.createElement("span");
      position.className = "saved-document-page";
      position.textContent = `Page ${savedDocument.lastPage} / ${savedDocument.totalPages}`;
      details.append(title, position);
      openButton.append(preview, details);
      openButton.addEventListener("click", () => {
        void this.#runDocumentAction(openButton, () => this.#openDocument(savedDocument.id));
      });

      const removeButton = document.createElement("button");
      removeButton.className = "saved-document-remove";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.title = "Remove from saved documents";
      removeButton.setAttribute("aria-label", `Remove ${savedDocument.title} from saved documents`);
      removeButton.addEventListener("click", () => {
        void this.#runDocumentAction(removeButton, () => this.#removeDocument(savedDocument.id));
      });

      row.append(dragHandle, openButton, removeButton);
      this.#documentButtons.set(savedDocument.id, openButton);
      fragment.append(row);
    }
    this.#elements.documentsList.append(fragment);
  }

  setBookmarks(bookmarks: PageBookmark[]): void {
    this.#bookmarks = [...bookmarks];
    this.#bookmarkButtons.clear();
    this.#elements.bookmarksList.replaceChildren();
    if (bookmarks.length === 0) {
      this.#elements.bookmarksList.append(this.#status("Bookmark pages to collect them here."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const bookmark of bookmarks) {
      const row = document.createElement("article");
      row.className = "page-bookmark";
      row.dataset.pageNumber = String(bookmark.pageNumber);

      const openButton = document.createElement("button");
      openButton.className = "page-bookmark-open";
      openButton.type = "button";
      openButton.title = `${bookmark.title} — page ${bookmark.pageNumber}`;
      openButton.setAttribute("aria-label", `Go to page ${bookmark.pageNumber}: ${bookmark.title}`);
      if (bookmark.pageNumber === this.#currentPage) {
        openButton.setAttribute("aria-current", "page");
      }

      const title = document.createElement("span");
      title.className = "page-bookmark-title";
      title.textContent = bookmark.title;
      const page = document.createElement("span");
      page.className = "page-bookmark-page";
      page.textContent = `Page ${bookmark.pageNumber}`;
      openButton.append(title);
      if (bookmark.note) {
        const note = document.createElement("span");
        note.className = "page-bookmark-note";
        note.textContent = bookmark.note;
        openButton.append(note);
      }
      openButton.append(page);
      openButton.addEventListener("click", () => this.#navigate(bookmark.pageNumber));

      const actions = document.createElement("span");
      actions.className = "page-bookmark-actions";

      const editButton = document.createElement("button");
      editButton.className = "page-bookmark-edit";
      editButton.type = "button";
      editButton.textContent = "✎";
      editButton.title = `Edit page ${bookmark.pageNumber} bookmark`;
      editButton.setAttribute("aria-label", `Edit bookmark for page ${bookmark.pageNumber}`);
      editButton.addEventListener("click", () => this.#showBookmarkEditor(row, bookmark));

      const removeButton = document.createElement("button");
      removeButton.className = "page-bookmark-remove";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.title = `Remove page ${bookmark.pageNumber} bookmark`;
      removeButton.setAttribute("aria-label", `Remove bookmark for page ${bookmark.pageNumber}`);
      removeButton.addEventListener("click", () => {
        void this.#runBookmarkAction(removeButton, bookmark.pageNumber);
      });

      actions.append(editButton, removeButton);
      row.append(openButton, actions);
      this.#bookmarkButtons.set(bookmark.pageNumber, openButton);
      fragment.append(row);
    }
    this.#elements.bookmarksList.append(fragment);
  }

  setActiveDocument(id: string | null): void {
    for (const [documentId, button] of this.#documentButtons) {
      if (documentId === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  updateDocumentPage(id: string, pageNumber: number, totalPages: number): void {
    const button = this.#documentButtons.get(id);
    const position = button?.querySelector<HTMLElement>(".saved-document-page");
    if (position) position.textContent = `Page ${pageNumber} / ${totalPages}`;
  }

  setCurrentPage(pageNumber: number): void {
    const previous = this.#thumbnailButtons.get(this.#currentPage);
    previous?.removeAttribute("aria-current");
    this.#currentPage = pageNumber;
    const current = this.#thumbnailButtons.get(pageNumber);
    current?.setAttribute("aria-current", "page");
    for (const [bookmarkPage, button] of this.#bookmarkButtons) {
      if (bookmarkPage === pageNumber) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    this.#scrollCurrentThumbnailIntoView();
  }

  revealCurrentPage(): void {
    this.#scrollCurrentThumbnailIntoView();
  }

  destroy(): void {
    this.#thumbnailObserver?.disconnect();
    this.#thumbnailObserver = null;
    for (const task of this.#renderTasks.values()) task.cancel();
    this.#renderTasks.clear();
    this.#requestedThumbnails.clear();
    this.#thumbnailButtons.clear();
    this.#bookmarkButtons.clear();
    this.#bookmarks = [];
    this.#elements.thumbnailsList.replaceChildren();
    this.#elements.outlineList.replaceChildren();
    this.#elements.bookmarksList.replaceChildren(this.#status("Open a PDF to view its bookmarks."));
    this.#document = null;
  }

  dispose(): void {
    this.destroy();
    for (const objectUrl of this.#documentObjectUrls) URL.revokeObjectURL(objectUrl);
    this.#documentObjectUrls.length = 0;
    this.#documentButtons.clear();
  }

  #createThumbnailSlots(count: number): void {
    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const button = document.createElement("button");
      button.className = "thumbnail-item";
      button.type = "button";
      button.dataset.pageNumber = String(pageNumber);
      button.setAttribute("aria-label", `Go to page ${pageNumber}`);

      const preview = document.createElement("span");
      preview.className = "thumbnail-preview";
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      preview.append(canvas);

      const label = document.createElement("span");
      label.className = "thumbnail-label";
      label.textContent = String(pageNumber);
      button.append(preview, label);
      button.addEventListener("click", () => this.#navigate(pageNumber));
      this.#thumbnailButtons.set(pageNumber, button);
      fragment.append(button);
    }
    this.#elements.thumbnailsList.append(fragment);
  }

  #observeThumbnails(document: PDFDocumentProxy): void {
    this.#thumbnailObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const button = entry.target as HTMLButtonElement;
          const pageNumber = Number(button.dataset.pageNumber);
          if (!Number.isInteger(pageNumber) || button.dataset.rendered === "true") continue;
          void this.#renderThumbnail(document, pageNumber, button);
        }
      },
      { root: this.#elements.thumbnailsPanel, rootMargin: "320px 0px", threshold: 0.01 },
    );
    for (const button of this.#thumbnailButtons.values()) this.#thumbnailObserver.observe(button);
  }

  async #renderThumbnail(
    document: PDFDocumentProxy,
    pageNumber: number,
    button: HTMLButtonElement,
  ): Promise<void> {
    if (this.#requestedThumbnails.has(pageNumber) || this.#document !== document) return;
    this.#requestedThumbnails.set(pageNumber, document);
    try {
      const page = await document.getPage(pageNumber);
      if (this.#document !== document) {
        page.cleanup();
        return;
      }
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = THUMBNAIL_CSS_WIDTH / baseViewport.width;
      const renderScale = limitedScale(
        baseViewport.width,
        baseViewport.height,
        cssScale * devicePixelRatio,
        MAX_THUMBNAIL_PIXELS,
      );
      const viewport = page.getViewport({ scale: renderScale });
      const dimensions = canvasDimensions(baseViewport.width, baseViewport.height, renderScale);
      const canvas = button.querySelector<HTMLCanvasElement>("canvas");
      const preview = button.querySelector<HTMLElement>(".thumbnail-preview");
      if (!canvas || !preview) {
        page.cleanup();
        return;
      }

      preview.style.setProperty(
        "--thumbnail-aspect",
        `${baseViewport.width} / ${baseViewport.height}`,
      );
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const task = page.render({ canvas, viewport });
      this.#renderTasks.set(pageNumber, task);
      try {
        await task.promise;
        if (this.#document === document) button.dataset.rendered = "true";
      } finally {
        if (this.#renderTasks.get(pageNumber) === task) this.#renderTasks.delete(pageNumber);
        page.cleanup();
      }
    } catch {
      if (this.#document === document)
        this.#reportError(`Could not render thumbnail ${pageNumber}.`);
    } finally {
      if (this.#requestedThumbnails.get(pageNumber) === document) {
        this.#requestedThumbnails.delete(pageNumber);
      }
    }
  }

  #renderOutline(document: PDFDocumentProxy, outline: OutlineItem[]): void {
    if (outline.length === 0) {
      this.#elements.outlineList.replaceChildren(
        this.#status("This PDF has no table of contents."),
      );
      return;
    }
    this.#elements.outlineList.replaceChildren(this.#createOutlineLevel(document, outline, 0));
  }

  #createOutlineLevel(
    document: PDFDocumentProxy,
    items: OutlineItem[],
    depth: number,
  ): HTMLUListElement {
    const list = documentOwner().createElement("ul");
    list.className = "outline-level";
    for (const item of items) {
      const listItem = documentOwner().createElement("li");
      const row = documentOwner().createElement("div");
      row.className = "outline-row";
      row.style.setProperty("--outline-depth", String(depth));

      let childList: HTMLUListElement | null = null;
      const toggle = documentOwner().createElement("button");
      toggle.type = "button";
      toggle.className = "outline-toggle";
      if (item.items.length > 0) {
        toggle.setAttribute("aria-label", `Expand ${item.title}`);
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "›";
        childList = this.#createOutlineLevel(document, item.items, depth + 1);
        childList.hidden = true;
        toggle.addEventListener("click", () => {
          if (!childList) return;
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          toggle.setAttribute("aria-label", `${expanded ? "Expand" : "Collapse"} ${item.title}`);
          childList.hidden = expanded;
        });
      } else {
        toggle.disabled = true;
        toggle.setAttribute("aria-hidden", "true");
      }

      const link = documentOwner().createElement("button");
      link.type = "button";
      link.className = "outline-link";
      link.textContent = item.title || "Untitled section";
      const destination = item.dest;
      if (destination) {
        link.addEventListener(
          "click",
          () => void this.#navigateToDestination(document, destination),
        );
      } else if (item.url) {
        link.title = item.url;
        link.disabled = true;
      } else {
        link.disabled = true;
      }
      row.append(toggle, link);
      listItem.append(row);
      if (childList) listItem.append(childList);
      list.append(listItem);
    }
    return list;
  }

  async #navigateToDestination(
    document: PDFDocumentProxy,
    destination: string | unknown[],
  ): Promise<void> {
    try {
      const pageNumber = await destinationPageNumber(document, destination);
      if (this.#document === document) this.#navigate(pageNumber);
    } catch {
      if (this.#document === document)
        this.#reportError("Could not open that table-of-contents entry.");
    }
  }

  #scrollCurrentThumbnailIntoView(): void {
    if (this.#elements.root.hidden || this.#elements.thumbnailsPanel.hidden) return;
    this.#thumbnailButtons.get(this.#currentPage)?.scrollIntoView({ block: "nearest" });
  }

  readonly #dragDocumentOver = (event: DragEvent): void => {
    if (!this.#draggedDocumentId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const draggedRow = this.#documentRow(this.#draggedDocumentId);
    if (!draggedRow) return;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(".saved-document") : null;
    if (!target) {
      this.#elements.documentsList.append(draggedRow);
      return;
    }
    if (target === draggedRow) return;
    const insertAfter =
      event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    this.#elements.documentsList.insertBefore(
      draggedRow,
      insertAfter ? target.nextSibling : target,
    );
  };

  readonly #dropDocument = (event: DragEvent): void => {
    if (!this.#draggedDocumentId) return;
    event.preventDefault();
    const ids = [...this.#elements.documentsList.querySelectorAll<HTMLElement>(".saved-document")]
      .map((row) => row.dataset.documentId)
      .filter((id): id is string => Boolean(id));
    void this.#reorderDocuments(ids).catch(() => {
      this.#reportError("Could not save the document order.");
    });
    this.#finishDocumentDrag();
  };

  #finishDocumentDrag(): void {
    if (this.#draggedDocumentId) {
      this.#documentRow(this.#draggedDocumentId)?.classList.remove("is-dragging");
    }
    this.#draggedDocumentId = null;
    this.#elements.documentsList.classList.remove("is-reordering");
  }

  #documentRow(id: string): HTMLElement | null {
    for (const row of this.#elements.documentsList.querySelectorAll<HTMLElement>(
      ".saved-document",
    )) {
      if (row.dataset.documentId === id) return row;
    }
    return null;
  }

  #status(message: string): HTMLParagraphElement {
    const status = document.createElement("p");
    status.className = "sidebar-status";
    status.textContent = message;
    return status;
  }

  async #runDocumentAction(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    button.disabled = true;
    try {
      await action();
    } catch {
      this.#reportError("Could not update saved documents.");
    } finally {
      button.disabled = false;
    }
  }

  async #runBookmarkAction(button: HTMLButtonElement, pageNumber: number): Promise<void> {
    button.disabled = true;
    try {
      await this.#removeBookmark(pageNumber);
    } catch {
      this.#reportError("Could not remove the bookmark.");
    } finally {
      button.disabled = false;
    }
  }

  #showBookmarkEditor(row: HTMLElement, bookmark: PageBookmark): void {
    const form = document.createElement("form");
    form.className = "page-bookmark-editor";

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Title";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = bookmark.title;
    titleInput.maxLength = MAX_BOOKMARK_TITLE_LENGTH;
    titleInput.setAttribute("aria-label", `Bookmark title for page ${bookmark.pageNumber}`);
    titleLabel.append(titleInput);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note";
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.value = bookmark.note ?? "";
    noteInput.maxLength = MAX_BOOKMARK_NOTE_LENGTH;
    noteInput.placeholder = "Optional note";
    noteInput.setAttribute("aria-label", `Bookmark note for page ${bookmark.pageNumber}`);
    noteLabel.append(noteInput);

    const actions = document.createElement("span");
    actions.className = "page-bookmark-editor-actions";
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "Save";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => this.#cancelBookmarkEdit(bookmark.pageNumber));
    actions.append(saveButton, cancelButton);
    form.append(titleLabel, noteLabel, actions);

    form.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.#cancelBookmarkEdit(bookmark.pageNumber);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#runBookmarkEdit(form, bookmark.pageNumber, titleInput.value, noteInput.value);
    });

    row.classList.add("is-editing");
    row.replaceChildren(form);
    titleInput.focus();
    titleInput.select();
  }

  async #runBookmarkEdit(
    form: HTMLFormElement,
    pageNumber: number,
    title: string,
    note: string,
  ): Promise<void> {
    for (const control of form.elements) {
      if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
        control.disabled = true;
      }
    }
    try {
      await this.#editBookmark(pageNumber, title, note);
    } catch {
      this.#reportError("Could not save the bookmark note.");
      for (const control of form.elements) {
        if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
          control.disabled = false;
        }
      }
    }
  }

  #cancelBookmarkEdit(pageNumber: number): void {
    this.setBookmarks(this.#bookmarks);
    this.#elements.bookmarksList
      .querySelector<HTMLButtonElement>(
        `.page-bookmark[data-page-number="${pageNumber}"] .page-bookmark-edit`,
      )
      ?.focus();
  }
}

function documentOwner(): Document {
  return globalThis.document;
}
