import type { PDFDocumentProxy } from "pdfjs-dist";

export type PageBookmark = {
  id: string;
  documentId: string;
  pageNumber: number;
  title: string;
  createdAt: number;
};

type BookmarkTextContent = {
  items: ({ str: string } | { type: string })[];
};

const DATABASE_NAME = "pdf-read-helper-bookmarks";
const DATABASE_VERSION = 1;
const BOOKMARK_STORE = "bookmarks";
const DOCUMENT_INDEX = "documentId";
const MAX_BOOKMARK_TITLE_LENGTH = 90;

export class PageBookmarkStore {
  #databasePromise: Promise<IDBDatabase> | null = null;

  async list(documentId: string): Promise<PageBookmark[]> {
    const database = await this.#database();
    const transaction = database.transaction(BOOKMARK_STORE, "readonly");
    const request = transaction
      .objectStore(BOOKMARK_STORE)
      .index(DOCUMENT_INDEX)
      .getAll(IDBKeyRange.only(documentId));
    const bookmarks = await requestResult<PageBookmark[]>(request);
    await transactionDone(transaction);
    return sortPageBookmarks(bookmarks);
  }

  async put(bookmark: PageBookmark): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(BOOKMARK_STORE, "readwrite");
    transaction.objectStore(BOOKMARK_STORE).put(bookmark);
    await transactionDone(transaction);
  }

  async remove(documentId: string, pageNumber: number): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(BOOKMARK_STORE, "readwrite");
    transaction.objectStore(BOOKMARK_STORE).delete(pageBookmarkKey(documentId, pageNumber));
    await transactionDone(transaction);
  }

  async removeDocument(documentId: string): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(BOOKMARK_STORE, "readwrite");
    const store = transaction.objectStore(BOOKMARK_STORE);
    const cursorRequest = store.index(DOCUMENT_INDEX).openKeyCursor(IDBKeyRange.only(documentId));
    cursorRequest.addEventListener("success", () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    });
    await transactionDone(transaction);
  }

  #database(): Promise<IDBDatabase> {
    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (database.objectStoreNames.contains(BOOKMARK_STORE)) return;
        const store = database.createObjectStore(BOOKMARK_STORE, { keyPath: "id" });
        store.createIndex(DOCUMENT_INDEX, DOCUMENT_INDEX, { unique: false });
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Bookmark storage failed.")),
      );
    });
    return this.#databasePromise;
  }
}

export function pageBookmarkKey(documentId: string, pageNumber: number): string {
  return JSON.stringify([documentId, pageNumber]);
}

export function sortPageBookmarks(bookmarks: PageBookmark[]): PageBookmark[] {
  return [...bookmarks].sort(
    (left, right) => left.pageNumber - right.pageNumber || left.createdAt - right.createdAt,
  );
}

export function bookmarkTitleFromText(content: BookmarkTextContent, pageNumber: number): string {
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const text = item.str.trim().replace(/\s+/g, " ");
    if (!text || /^\d{1,4}$/.test(text) || /^page\s+\d+$/i.test(text)) continue;
    if (text.length < 4) continue;
    return truncateBookmarkTitle(text);
  }
  return `Page ${pageNumber}`;
}

export async function extractBookmarkTitle(
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent({
    includeMarkedContent: true,
    disableNormalization: true,
  });
  return bookmarkTitleFromText(content, pageNumber);
}

function truncateBookmarkTitle(value: string): string {
  if (value.length <= MAX_BOOKMARK_TITLE_LENGTH) return value;
  return `${value.slice(0, MAX_BOOKMARK_TITLE_LENGTH - 1).trimEnd()}…`;
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result as T));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Bookmark storage failed.")),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("Bookmark storage failed.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("Bookmark storage failed.")),
    );
  });
}
