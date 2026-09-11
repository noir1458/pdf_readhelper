import type { TranslationProviderId, TranslationUsage } from "./translation-provider";

export type CachedPageTranslation = {
  id: string;
  documentId: string;
  pageNumber: number;
  providerId: TranslationProviderId;
  model: string;
  text: string;
  usage: TranslationUsage;
  updatedAt: number;
};

const DATABASE_NAME = "pdf-read-helper-translations";
const DATABASE_VERSION = 1;
const TRANSLATION_STORE = "translations";
const DOCUMENT_INDEX = "documentId";
const CAPTURE_VERSION = "cropped-70-v1";

export class TranslationCache {
  #databasePromise: Promise<IDBDatabase> | null = null;

  async get(
    documentId: string,
    pageNumber: number,
    providerId: TranslationProviderId,
    model: string,
  ): Promise<CachedPageTranslation | null> {
    const database = await this.#database();
    const transaction = database.transaction(TRANSLATION_STORE, "readonly");
    const store = transaction.objectStore(TRANSLATION_STORE);
    const recordPromise = requestResult<CachedPageTranslation | undefined>(
      store.get(translationCacheKey(documentId, pageNumber, providerId, model)),
    );
    const legacyRecordPromise =
      providerId === "openai"
        ? requestResult<LegacyCachedPageTranslation | undefined>(
            store.get(legacyTranslationCacheKey(documentId, pageNumber, model)),
          )
        : Promise.resolve(undefined);
    const [record, legacyRecord] = await Promise.all([recordPromise, legacyRecordPromise]);
    await transactionDone(transaction);
    if (record) return record;
    return legacyRecord ? { ...legacyRecord, providerId } : null;
  }

  async put(
    documentId: string,
    pageNumber: number,
    providerId: TranslationProviderId,
    model: string,
    text: string,
    usage: TranslationUsage,
  ): Promise<CachedPageTranslation> {
    const record: CachedPageTranslation = {
      id: translationCacheKey(documentId, pageNumber, providerId, model),
      documentId,
      pageNumber,
      providerId,
      model,
      text,
      usage,
      updatedAt: Date.now(),
    };
    const database = await this.#database();
    const transaction = database.transaction(TRANSLATION_STORE, "readwrite");
    transaction.objectStore(TRANSLATION_STORE).put(record);
    await transactionDone(transaction);
    return record;
  }

  async removeDocument(documentId: string): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction(TRANSLATION_STORE, "readwrite");
    const index = transaction.objectStore(TRANSLATION_STORE).index(DOCUMENT_INDEX);
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(documentId));
    cursorRequest.addEventListener("success", () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      transaction.objectStore(TRANSLATION_STORE).delete(cursor.primaryKey);
      cursor.continue();
    });
    await transactionDone(transaction);
  }

  #database(): Promise<IDBDatabase> {
    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (database.objectStoreNames.contains(TRANSLATION_STORE)) return;
        const store = database.createObjectStore(TRANSLATION_STORE, { keyPath: "id" });
        store.createIndex(DOCUMENT_INDEX, DOCUMENT_INDEX, { unique: false });
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Translation storage failed.")),
      );
    });
    return this.#databasePromise;
  }
}

export function translationCacheKey(
  documentId: string,
  pageNumber: number,
  providerId: TranslationProviderId,
  model: string,
): string {
  return `${CAPTURE_VERSION}:${providerId}:${model}:${documentId}:${pageNumber}`;
}

type LegacyCachedPageTranslation = Omit<CachedPageTranslation, "providerId">;

function legacyTranslationCacheKey(documentId: string, pageNumber: number, model: string): string {
  return `${CAPTURE_VERSION}:${model}:${documentId}:${pageNumber}`;
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result as T));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Translation storage failed.")),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("Translation storage failed.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("Translation storage failed.")),
    );
  });
}
