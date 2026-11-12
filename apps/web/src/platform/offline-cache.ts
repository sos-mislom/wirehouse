import { isMobileApp } from "../mobile-product";

// Read-only offline mode for the mobile app. Every successful GET is kept in
// IndexedDB; when the server cannot be reached the last saved response is
// returned instead and the app shows when that data was saved. Commands
// (POST/PUT/DELETE) are never replayed from here. The cache belongs to the
// signed-in session and is wiped on sign-out.

type Saved = {
  path: string;
  owner: string;
  savedAt: number;
  payload: unknown;
};

const databaseName = "wirehouse-offline";
const storeName = "responses";
const keepResponses = 300;

let database: Promise<IDBDatabase> | undefined;
// Bumped on wipe so a read that finishes after sign-out is not saved.
let generation = 0;
let writesSincePrune = 0;

// Rows are tagged with a fingerprint of the session token, so another
// session never sees them even before the sign-out wipe has finished.
const fingerprint = (token: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++)
    hash = Math.imul(hash ^ token.charCodeAt(i), 0x01000193);
  return `${token.length}:${(hash >>> 0).toString(36)}`;
};

export const isCacheablePath = (path: string) =>
  isMobileApp &&
  typeof indexedDB !== "undefined" &&
  !path.startsWith("/api/realtime") &&
  (!path.startsWith("/api/auth/") || path === "/api/auth/me");

function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result
        .createObjectStore(storeName, { keyPath: "path" })
        .createIndex("savedAt", "savedAt");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

function run<T>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = use(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function saveResponse(
  path: string,
  token: string | undefined,
  payload: unknown,
) {
  if (!token || !isCacheablePath(path)) return;
  const started = generation;
  void run("readwrite", (store) => {
    if (started !== generation) return;
    store.put({
      path,
      owner: fingerprint(token),
      savedAt: Date.now(),
      payload,
    } satisfies Saved);
  })
    .then(() => {
      if (++writesSincePrune >= 50) {
        writesSincePrune = 0;
        return prune();
      }
    })
    .catch(() => undefined);
}

export async function readSavedResponse(
  path: string,
  token: string | undefined,
) {
  if (!token || !isCacheablePath(path)) return undefined;
  try {
    const saved = (await run<Saved>("readonly", (store) => store.get(path))) as
      Saved | undefined;
    return saved?.owner === fingerprint(token) ? saved : undefined;
  } catch {
    return undefined;
  }
}

// Filters and searches create many paths; keep only the most recent ones.
function prune() {
  return run("readwrite", (store) => {
    const count = store.count();
    count.onsuccess = () => {
      let excess = count.result - keepResponses;
      if (excess <= 0) return;
      store.index("savedAt").openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (!cursor || excess-- <= 0) return;
        cursor.delete();
        cursor.continue();
      };
    };
  });
}

export function wipeSavedResponses() {
  generation++;
  if (!isMobileApp || typeof indexedDB === "undefined") return;
  void run("readwrite", (store) => {
    store.clear();
  }).catch(() => undefined);
}

// Offline status: null while the server answers; otherwise the save time of
// the oldest response shown since the connection was lost.
let offlineSince: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const offlineStatus = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => offlineSince,
};

export function markShownFromCache(savedAt: number) {
  if (offlineSince === null || savedAt < offlineSince) {
    offlineSince = savedAt;
    emit();
  }
}

export function markServerReachable() {
  if (offlineSince === null) return;
  offlineSince = null;
  emit();
}
