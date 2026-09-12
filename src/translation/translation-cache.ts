import {
  DEFAULT_TRANSLATION_LANGUAGE,
  finiteNumber,
  isRecord,
  type TranslationProviderId,
  type TranslationUsage,
} from "./translation-provider";

export type CachedPageTranslation = {
  id: string;
  documentId: string;
  pageNumber: number;
  providerId: TranslationProviderId;
  model: string;
  targetLanguage: string;
  text: string;
  usage: TranslationUsage;
  updatedAt: number;
};

const DATABASE_NAME = "pdf-read-helper-translations";
const DATABASE_VERSION = 2;
const TRANSLATION_STORE = "translations";
const DOCUMENT_INDEX = "documentId";
const CAPTURE_VERSION = "cropped-70-v1";

export class TranslationCache {
  #databasePromise: Promise<IDBDatabase> | null = null;

  async get(documentId: string, pageNumber: number): Promise<CachedPageTranslation | null> {
    const database = await this.#database();
    const transaction = database.transaction(TRANSLATION_STORE, "readonly");
    const store = transaction.objectStore(TRANSLATION_STORE);
    const recordPromise = requestResult<CachedPageTranslation | undefined>(
      store.get(translationCacheKey(documentId, pageNumber)),
    );
    const record = await recordPromise;
    await transactionDone(transaction);
    return record ?? null;
  }

  async put(
    documentId: string,
    pageNumber: number,
    providerId: TranslationProviderId,
    model: string,
    targetLanguage: string,
    text: string,
    usage: TranslationUsage,
  ): Promise<CachedPageTranslation> {
    const record: CachedPageTranslation = {
      id: translationCacheKey(documentId, pageNumber),
      documentId,
      pageNumber,
      providerId,
      model,
      targetLanguage,
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
      request.addEventListener("upgradeneeded", (event) => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TRANSLATION_STORE)) {
          const store = database.createObjectStore(TRANSLATION_STORE, { keyPath: "id" });
          store.createIndex(DOCUMENT_INDEX, DOCUMENT_INDEX, { unique: false });
          return;
        }
        if (event.oldVersion < 2) {
          collapseLegacyTranslationRecords(
            request.transaction?.objectStore(TRANSLATION_STORE) ?? null,
          );
        }
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
): string {
  return `${CAPTURE_VERSION}:latest:${documentId}:${pageNumber}`;
}

function collapseLegacyTranslationRecords(store: IDBObjectStore | null): void {
  if (!store) return;
  const cursorRequest = store.openCursor();
  cursorRequest.addEventListener("success", () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const record = cachedPageTranslation(cursor.value);
    if (!record) {
      cursor.continue();
      return;
    }
    const latestId = translationCacheKey(record.documentId, record.pageNumber);
    if (cursor.primaryKey === latestId) {
      cursor.continue();
      return;
    }
    const latestRequest = store.get(latestId);
    latestRequest.addEventListener("success", () => {
      const latest = cachedPageTranslation(latestRequest.result);
      if (!latest || latest.updatedAt <= record.updatedAt) {
        store.put({ ...record, id: latestId });
      }
      cursor.delete();
      cursor.continue();
    });
  });
}

function cachedPageTranslation(value: unknown): CachedPageTranslation | null {
  if (
    !isRecord(value) ||
    typeof value.documentId !== "string" ||
    typeof value.pageNumber !== "number" ||
    !Number.isInteger(value.pageNumber) ||
    typeof value.model !== "string" ||
    typeof value.text !== "string"
  ) {
    return null;
  }
  const providerId: TranslationProviderId = value.providerId === "gemini" ? "gemini" : "openai";
  const targetLanguage =
    typeof value.targetLanguage === "string"
      ? value.targetLanguage
      : DEFAULT_TRANSLATION_LANGUAGE;
  const usage: TranslationUsage = {};
  if (isRecord(value.usage)) {
    const inputTokens = finiteNumber(value.usage.inputTokens);
    const outputTokens = finiteNumber(value.usage.outputTokens);
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  }
  return {
    id: typeof value.id === "string" ? value.id : "",
    documentId: value.documentId,
    pageNumber: value.pageNumber,
    providerId,
    model: value.model,
    targetLanguage,
    text: value.text,
    usage,
    updatedAt: finiteNumber(value.updatedAt) ?? 0,
  };
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
