import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfSource } from "../shared/types";
import { canvasDimensions, limitedScale } from "./render-math";

export type SavedDocumentSummary = {
  id: string;
  title: string;
  source: PdfSource;
  thumbnail: Blob | null;
  lastPage: number;
  totalPages: number;
  updatedAt: number;
  sortOrder?: number;
};

export type SavedDocument = SavedDocumentSummary & {
  bytes: ArrayBuffer;
};

const DATABASE_NAME = "pdf-read-helper-library";
const DATABASE_VERSION = 1;
const METADATA_STORE = "documents";
const FILE_STORE = "files";
const THUMBNAIL_WIDTH = 112;
const MAX_THUMBNAIL_PIXELS = 500_000;

type SavedFile = { id: string; bytes: ArrayBuffer };

export class DocumentLibrary {
  #databasePromise: Promise<IDBDatabase> | null = null;

  async list(): Promise<SavedDocumentSummary[]> {
    const database = await this.#database();
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const records = await requestResult<SavedDocumentSummary[]>(
      transaction.objectStore(METADATA_STORE).getAll(),
    );
    await transactionDone(transaction);
    return sortSavedDocuments(records);
  }

  async getMetadata(id: string): Promise<SavedDocumentSummary | null> {
    const database = await this.#database();
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const record = await requestResult<SavedDocumentSummary | undefined>(
      transaction.objectStore(METADATA_STORE).get(id),
    );
    await transactionDone(transaction);
    return record ?? null;
  }

  async get(id: string): Promise<SavedDocument | null> {
    const database = await this.#database();
    const transaction = database.transaction([METADATA_STORE, FILE_STORE], "readonly");
    const metadataRequest = transaction.objectStore(METADATA_STORE).get(id);
    const fileRequest = transaction.objectStore(FILE_STORE).get(id);
    const [metadata, file] = await Promise.all([
      requestResult<SavedDocumentSummary | undefined>(metadataRequest),
      requestResult<SavedFile | undefined>(fileRequest),
    ]);
    await transactionDone(transaction);
    if (!metadata || !file) return null;
    return { ...metadata, bytes: file.bytes };
  }

  async save(metadata: SavedDocumentSummary, bytes: ArrayBuffer): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction([METADATA_STORE, FILE_STORE], "readwrite");
    transaction.objectStore(METADATA_STORE).put(metadata);
    transaction.objectStore(FILE_STORE).put({ id: metadata.id, bytes } satisfies SavedFile);
    await transactionDone(transaction);
  }

  async updateLastPage(id: string, pageNumber: number): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    const store = transaction.objectStore(METADATA_STORE);
    const metadata = await requestResult<SavedDocumentSummary | undefined>(store.get(id));
    if (metadata) {
      store.put({ ...metadata, lastPage: pageNumber, updatedAt: Date.now() });
    }
    await transactionDone(transaction);
  }

  async reorder(ids: string[]): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    const store = transaction.objectStore(METADATA_STORE);
    const records = await requestResult<SavedDocumentSummary[]>(store.getAll());
    const positions = new Map<string, number>();
    for (const id of ids) {
      if (!positions.has(id)) positions.set(id, positions.size);
    }
    let nextPosition = positions.size;
    for (const record of records) {
      const sortOrder = positions.get(record.id) ?? nextPosition++;
      store.put({ ...record, sortOrder });
    }
    await transactionDone(transaction);
  }

  async remove(id: string): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction([METADATA_STORE, FILE_STORE], "readwrite");
    transaction.objectStore(METADATA_STORE).delete(id);
    transaction.objectStore(FILE_STORE).delete(id);
    await transactionDone(transaction);
  }

  #database(): Promise<IDBDatabase> {
    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(FILE_STORE)) {
          database.createObjectStore(FILE_STORE, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Storage failed.")),
      );
    });
    return this.#databasePromise;
  }
}

export function sortSavedDocuments(records: SavedDocumentSummary[]): SavedDocumentSummary[] {
  return records.sort((left, right) => {
    const leftHasOrder = Number.isFinite(left.sortOrder);
    const rightHasOrder = Number.isFinite(right.sortOrder);
    if (leftHasOrder && rightHasOrder) return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (leftHasOrder !== rightHasOrder) return leftHasOrder ? 1 : -1;
    return right.updatedAt - left.updatedAt;
  });
}

export function documentLibraryId(document: PDFDocumentProxy, source: PdfSource): string {
  const fingerprint = document.fingerprints[0];
  if (fingerprint) return fingerprint;
  return source.kind === "local-file" ? `file:${source.name}` : `url:${source.url}`;
}

export function documentLibraryTitle(source: PdfSource): string {
  if (source.kind === "local-file") return source.name;
  try {
    const url = new URL(source.url);
    const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return filename || url.hostname || "PDF document";
  } catch {
    return "PDF document";
  }
}

export async function renderLibraryThumbnail(document: PDFDocumentProxy): Promise<Blob | null> {
  const page = await document.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const requestedScale = (THUMBNAIL_WIDTH / baseViewport.width) * devicePixelRatio;
  const scale = limitedScale(
    baseViewport.width,
    baseViewport.height,
    requestedScale,
    MAX_THUMBNAIL_PIXELS,
  );
  const viewport = page.getViewport({ scale });
  const dimensions = canvasDimensions(baseViewport.width, baseViewport.height, scale);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  try {
    await page.render({ canvas, viewport }).promise;
    return await canvasToBlob(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result as T));
    request.addEventListener("error", () => reject(request.error ?? new Error("Storage failed.")));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("Storage failed.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("Storage failed.")),
    );
  });
}
