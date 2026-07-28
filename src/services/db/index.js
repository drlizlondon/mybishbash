// ─── services/db — IndexedDB wrapper (Phase 5, commit 1) ────────────────────
//
// A thin, dependency-free wrapper around the raw IndexedDB API. It knows about
// two object stores and nothing about myBishBash's domain:
//
//   kv    — string key → string value. Holds exactly what localStorage holds
//           today: the JSON *strings* produced by storage.js/eventLog.js. No
//           re-shaping happens here or anywhere in Phase 5.
//   meta  — bookkeeping for the persistence layer itself (migration flags,
//           provenance). Values may be arbitrary structured-cloneable objects.
//
// ── Schema history (SQL-migration discipline: append, never edit) ───────────
//   v1  (Phase 5) — creates `kv` and `meta`, both out-of-line keyed by the
//                   caller-supplied string key.
//
// Every future version bump adds a line above AND a matching branch in
// `runUpgrade()`. `onupgradeneeded` must remain replayable from version 0, so
// each branch is written as "if the store/index is missing, create it" rather
// than assuming the immediately preceding version.
//
// This module has zero production consumers until Phase 5 commit 2 introduces
// the engine seam in storage.js.

export const DB_NAME = "mybishbash";
export const DB_VERSION = 1;
export const KV_STORE = "kv";
export const META_STORE = "meta";

let dbPromise = null;

/** True when the environment exposes a usable IndexedDB factory. */
export function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function runUpgrade(db) {
  // v1 — kv + meta.
  if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
  if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
}

/**
 * Open (and cache) the database. Concurrent callers share one open request.
 * A failed open clears the cache so a later caller may retry.
 */
export function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => runUpgrade(request.result);
    request.onblocked = () => reject(new Error("IndexedDB open blocked by another connection"));
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => {
      const db = request.result;
      // A version change from another tab invalidates this handle; drop the
      // cache so the next call reopens rather than using a closing connection.
      db.onversionchange = () => {
        db.close();
        if (dbPromise) dbPromise = null;
      };
      resolve(db);
    };
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/** Close and forget the cached connection (tests, engine fallback). */
export async function closeDb() {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  try {
    (await pending).close();
  } catch {
    // An open that never succeeded has nothing to close.
  }
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore(storeName, mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result;
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.oncomplete = () => resolve(result);
    Promise.resolve(run(tx.objectStore(storeName)))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        try {
          tx.abort();
        } catch {
          // Already aborting.
        }
        reject(error);
      });
  });
}

// ─── Per-key write chain ────────────────────────────────────────────────────
// storage.js writes are fire-and-forget (`void kvPut(...)`), so several puts to
// one key can be outstanding at once. Two things follow.
//
// Ordering: IndexedDB already serialises readwrite transactions with
// overlapping scope in *creation* order, and today every write creates its
// transaction immediately, so last-write-wins holds with or without this chain
// — a mutation test confirmed the chain is currently redundant *for ordering
// alone*. It is kept because it makes the guarantee independent of the code
// shape: the moment any write path awaits something before creating its
// transaction (a retry, a quota probe, a re-open after a version change),
// creation order stops tracking call order and the chain is the only thing
// holding the line. It costs one promise per key.
//
// Awaitability: this is the chain's load-bearing job today. Fire-and-forget
// writes are otherwise unobservable, so nothing — not storage.js's hydration
// path, not a test — could know when they had landed. The chain is what
// `flushWrites()` and `pendingWriteKeyCount()` read.
//
// Different keys stay fully concurrent.
const writeChains = new Map();

function chainWrite(key, run) {
  const previous = writeChains.get(key) ?? Promise.resolve();
  // `.catch` on the tail keeps one failed write from poisoning the whole chain.
  const next = previous.catch(() => {}).then(run);
  writeChains.set(key, next);
  const forget = () => {
    if (writeChains.get(key) === next) writeChains.delete(key);
  };
  next.then(forget, forget);
  return next;
}

/** Number of keys with in-flight or just-settled writes (diagnostics/tests). */
export function pendingWriteKeyCount() {
  return writeChains.size;
}

/** Resolve once every queued write has settled. */
export async function flushWrites() {
  // Each pass settles the chains present when it started; writes queued during
  // the await (and entries not yet self-removed) are caught by the next pass.
  // The guard stops a caller from hanging under a continuous write stream.
  for (let pass = 0; pass < 50 && writeChains.size > 0; pass += 1) {
    await Promise.allSettled(Array.from(writeChains.values()));
  }
}

// ─── kv store ───────────────────────────────────────────────────────────────

/** @returns {Promise<string|null>} the stored string, or null if absent. */
export async function kvGet(key) {
  const value = await withStore(KV_STORE, "readonly", (store) => requestAsPromise(store.get(key)));
  return value === undefined ? null : value;
}

/** @returns {Promise<Map<string,string>>} every kv entry. */
export async function kvGetAll() {
  return withStore(KV_STORE, "readonly", async (store) => {
    const [keys, values] = await Promise.all([
      requestAsPromise(store.getAllKeys()),
      requestAsPromise(store.getAll()),
    ]);
    const entries = new Map();
    keys.forEach((key, index) => entries.set(key, values[index]));
    return entries;
  });
}

/** Write a string value. Ordered per key against other kvPut/kvDelete calls. */
export function kvPut(key, value) {
  return chainWrite(key, () =>
    withStore(KV_STORE, "readwrite", (store) => requestAsPromise(store.put(String(value), key))),
  );
}

/** Delete a key. Ordered per key against other kvPut/kvDelete calls. */
export function kvDelete(key) {
  return chainWrite(key, () =>
    withStore(KV_STORE, "readwrite", (store) => requestAsPromise(store.delete(key))),
  );
}

// ─── meta store ─────────────────────────────────────────────────────────────

/** @returns {Promise<unknown|null>} the stored meta value, or null if absent. */
export async function metaGet(key) {
  const value = await withStore(META_STORE, "readonly", (store) => requestAsPromise(store.get(key)));
  return value === undefined ? null : value;
}

/** Write a meta value (structured-cloneable). Ordered per key like kvPut. */
export function metaPut(key, value) {
  return chainWrite(`meta:${key}`, () =>
    withStore(META_STORE, "readwrite", (store) => requestAsPromise(store.put(value, key))),
  );
}

// ─── lifecycle ──────────────────────────────────────────────────────────────

/** Drop the whole database (tests, and a hard local reset). */
export async function deleteDb() {
  await closeDb();
  writeChains.clear();
  if (!isIndexedDbAvailable()) return;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed"));
    request.onblocked = () => resolve(); // Deletion completes once other handles close.
  });
}
