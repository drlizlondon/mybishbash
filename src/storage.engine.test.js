/**
 * Phase 5 commit 2 — the persistence engine seam in src/storage.js.
 *
 * The seam routes the single funnel (getStorageItem / setStorageItem /
 * removeStorageItem) by engine. This file pins the matrix the packet asks for:
 *
 *   legacy  × load/save round-trip           — unchanged behaviour behind the kill switch
 *   idb     × load/save round-trip           — synchronous reads off the mirror
 *   idb     × one-time migration              — raw-byte, idempotent, marker-last
 *   idb     × dual-write                     — mirror AND IndexedDB AND localStorage
 *   both    × legacy `bishbash.` prefix shim — still readable, still promoted
 *   both    × clearSharedMyBishBashState     — clears every sink
 *   idb     × open failure                   — lands in legacy mode + reports
 *
 * Every assertion goes through storage.js's PUBLIC API (loadX/saveX and the
 * exported funnel), never through internal state, so a seam that "works" by
 * accident of implementation shape still has to produce the right bytes in the
 * right sinks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENGINE_KEY = "mybishbash.storage-engine.v1";
const MIGRATION_RETRY_REQUEST_KEY = "mybishbash.storage-migration-retry.v1";
const MIGRATION_RETRY_ACK_KEY = "mybishbash.storage-migration-retry-ack.v1";
const MIGRATION_META_KEY = "migratedFromLocalStorage";

let store = new Map();

vi.stubGlobal("window", {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  },
});

// A fresh storage.js (and therefore fresh engine state) per test, plus a fresh
// IndexedDB, so no test can inherit another's mirror or database contents.
async function loadStorage({ engine } = {}) {
  vi.resetModules();
  const db = await import("./services/db/index.js");
  await db.deleteDb();
  if (engine) store.set(ENGINE_KEY, engine);
  const storage = await import("./storage.js");
  await storage.hydrateLocalData();
  return { storage, db };
}

beforeEach(() => {
  store = new Map();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("./services/db/index.js");
  vi.doUnmock("./services/errors/reporter.js");
  vi.resetModules();
});

// ─── Engine selection ───────────────────────────────────────────────────────

describe("engine selection", () => {
  it("defaults to idb and marks even an empty fresh install as migrated", async () => {
    const { storage, db } = await loadStorage();
    expect(storage.getActiveStorageEngine()).toBe("idb");
    expect(await db.metaGet(MIGRATION_META_KEY)).toEqual({
      at: expect.any(String),
      appVersion: expect.any(String),
    });
  });

  it("honours the kill switch in both directions", async () => {
    const idb = await loadStorage({ engine: "idb" });
    expect(idb.storage.getActiveStorageEngine()).toBe("idb");

    const legacy = await loadStorage({ engine: "localstorage" });
    expect(legacy.storage.getActiveStorageEngine()).toBe("localstorage");
  });

  it("ignores an unrecognised kill-switch value and uses the default", async () => {
    const { storage } = await loadStorage({ engine: "postgres" });
    expect(storage.getActiveStorageEngine()).toBe("idb");
  });

  it("hydrateLocalData resolves immediately in legacy mode and is idempotent", async () => {
    const { storage } = await loadStorage({ engine: "localstorage" });
    const first = storage.hydrateLocalData();
    expect(first).toBe(storage.hydrateLocalData());
    await expect(first).resolves.toBeUndefined();
  });
});

// ─── One-time localStorage migration ─────────────────────────────────────────

describe("localStorage migration", () => {
  it("imports canonical raw bytes, promotes legacy-only values, and retains every source key", async () => {
    const canonicalCards = '[ { "id": "canonical", "promptText": "exact bytes" } ]';
    const shadowedLegacyCards = '[{"id":"shadowed-legacy"}]';
    const legacyProfile = '{"name":"Legacy profile","timezone":"Europe/London"}';
    const unrelatedDeviceValue = '{"2026-07-30":"seen"}';

    store.set("mybishbash.cards.v1", canonicalCards);
    store.set("mybishbash.mood.v1", "");
    store.set("bishbash.cards.v1", shadowedLegacyCards);
    store.set("bishbash.profile.v1", legacyProfile);
    store.set("mybishbash.morning-summary.seen.v1", unrelatedDeviceValue);

    const { storage, db } = await loadStorage();

    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe(canonicalCards);
    expect(storage.getStorageItem("mybishbash.profile.v1")).toBe(legacyProfile);
    expect(await db.kvGet("mybishbash.cards.v1")).toBe(canonicalCards);
    expect(await db.kvGet("mybishbash.mood.v1")).toBe("");
    expect(await db.kvGet("mybishbash.profile.v1")).toBe(legacyProfile);
    expect(await db.kvGet("bishbash.cards.v1")).toBe(null);
    expect(await db.kvGet("bishbash.profile.v1")).toBe(null);
    expect(await db.kvGet("mybishbash.morning-summary.seen.v1")).toBe(null);

    // The source remains available for rollback. Legacy-only values are
    // promoted by the existing shim, but no source key is deleted.
    expect(store.get("mybishbash.cards.v1")).toBe(canonicalCards);
    expect(store.get("bishbash.cards.v1")).toBe(shadowedLegacyCards);
    expect(store.get("mybishbash.profile.v1")).toBe(legacyProfile);
    expect(store.get("bishbash.profile.v1")).toBe(legacyProfile);
    expect(store.get("mybishbash.morning-summary.seen.v1")).toBe(unrelatedDeviceValue);
  });

  it("does not re-import localStorage after the migration marker exists", async () => {
    const importedCards = '[{"id":"idb-wins"}]';
    const staleLocalStorageCards = '[{"id":"stale-localstorage"}]';
    store.set("mybishbash.cards.v1", importedCards);

    const { db } = await loadStorage();
    const firstMarker = await db.metaGet(MIGRATION_META_KEY);
    store.set("mybishbash.cards.v1", staleLocalStorageCards);

    vi.resetModules();
    const reloaded = await import("./storage.js");
    await reloaded.hydrateLocalData();

    expect(reloaded.getStorageItem("mybishbash.cards.v1")).toBe(importedCards);
    expect(await db.kvGet("mybishbash.cards.v1")).toBe(importedCards);
    expect(await db.metaGet(MIGRATION_META_KEY)).toEqual(firstMarker);
    expect(store.get("mybishbash.cards.v1")).toBe(staleLocalStorageCards);
  });

  it("replays a partial import wholesale when a crash left no marker", async () => {
    vi.resetModules();
    const db = await import("./services/db/index.js");
    await db.deleteDb();
    await db.kvPut("mybishbash.cards.v1", '[{"id":"partial-before-crash"}]');
    await db.kvPut("mybishbash.mood.v1", "stale-row-absent-from-source");

    const sourceCards = '[{"id":"replayed-from-localstorage"}]';
    const sourceProfile = '{"name":"Crash-safe"}';
    store.set("mybishbash.cards.v1", sourceCards);
    store.set("mybishbash.profile.v1", sourceProfile);

    vi.resetModules();
    const storage = await import("./storage.js");
    const hydratedDb = await import("./services/db/index.js");
    await storage.hydrateLocalData();

    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe(sourceCards);
    expect(await hydratedDb.kvGet("mybishbash.cards.v1")).toBe(sourceCards);
    expect(await hydratedDb.kvGet("mybishbash.profile.v1")).toBe(sourceProfile);
    expect(await hydratedDb.kvGet("mybishbash.mood.v1")).toBe(null);
    expect(await hydratedDb.metaGet(MIGRATION_META_KEY)).toEqual({
      at: expect.any(String),
      appVersion: expect.any(String),
    });
  });

  it("removes stale IndexedDB rows when forced recovery sees an absent local key", async () => {
    vi.resetModules();
    const db = await import("./services/db/index.js");
    await db.deleteDb();
    await db.kvPut("mybishbash.cards.v1", '[{"id":"deleted-during-fallback"}]');
    await db.kvPut("bishbash.cards.v1", '[{"id":"stale-legacy-prefix-row"}]');
    await db.metaPut(MIGRATION_META_KEY, {
      at: "2026-07-30T12:00:00.000Z",
      appVersion: "before-timeout",
    });
    store.set(MIGRATION_RETRY_REQUEST_KEY, "retry-after-delete");

    vi.resetModules();
    const storage = await import("./storage.js");
    const recoveredDb = await import("./services/db/index.js");
    await storage.hydrateLocalData();

    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe(null);
    expect(await recoveredDb.kvGet("mybishbash.cards.v1")).toBe(null);
    expect(await recoveredDb.kvGet("bishbash.cards.v1")).toBe(null);
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBe("retry-after-delete");
  });

  it("commits every imported value before the marker and seeds the mirror last", async () => {
    vi.resetModules();
    store.set("mybishbash.cards.v1", '[{"id":"ordered-card"}]');
    store.set("mybishbash.profile.v1", '{"name":"Ordered profile"}');

    const calls = [];
    const pending = new Map();
    const committed = new Map();
    const kvPut = vi.fn((key, value) => {
      calls.push(`put:start:${key}`);
      return new Promise((resolve) => {
        pending.set(key, () => {
          committed.set(key, value);
          calls.push(`put:done:${key}`);
          resolve();
        });
      });
    });
    const kvDelete = vi.fn(async (key) => {
      calls.push(`delete:start:${key}`);
      calls.push(`delete:done:${key}`);
    });
    let finishMarker;
    const metaPut = vi.fn(() => {
      calls.push("meta:start");
      return new Promise((resolve) => {
        finishMarker = () => {
          calls.push("meta:done");
          resolve();
        };
      });
    });
    const kvGetAll = vi.fn(async () => {
      calls.push("kv:get-all");
      return new Map(committed);
    });

    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites: vi.fn(async () => {}),
      kvGetAll,
      kvPut,
      kvDelete,
      metaGet: vi.fn(async () => null),
      metaPut,
    }));

    const storage = await import("./storage.js");
    const hydration = storage.hydrateLocalData();

    await vi.waitFor(() => expect(kvPut).toHaveBeenCalledTimes(1));
    expect(metaPut).not.toHaveBeenCalled();
    expect(kvGetAll).not.toHaveBeenCalled();

    pending.get("mybishbash.cards.v1")();
    await vi.waitFor(() => expect(kvPut).toHaveBeenCalledTimes(2));
    expect(metaPut).not.toHaveBeenCalled();
    expect(kvGetAll).not.toHaveBeenCalled();

    pending.get("mybishbash.profile.v1")();
    await vi.waitFor(() => expect(metaPut).toHaveBeenCalledOnce());
    expect(kvGetAll).not.toHaveBeenCalled();

    finishMarker();
    await hydration;

    expect(metaPut).toHaveBeenCalledWith(MIGRATION_META_KEY, {
      at: expect.any(String),
      appVersion: expect.any(String),
    });
    expect(calls.slice(0, 2)).toEqual([
      "put:start:mybishbash.cards.v1",
      "put:done:mybishbash.cards.v1",
    ]);
    expect(calls.indexOf("put:done:mybishbash.profile.v1")).toBeGreaterThan(
      calls.indexOf("put:start:mybishbash.profile.v1"),
    );
    expect(kvDelete).toHaveBeenCalledTimes(18);
    const markerStartIndex = calls.indexOf("meta:start");
    const storageMutationCalls = calls.filter((call) => call.startsWith("put:") || call.startsWith("delete:"));
    expect(storageMutationCalls).toHaveLength(40);
    expect(
      calls
        .map((call, index) => ({ call, index }))
        .filter(({ call }) => call.startsWith("put:done:") || call.startsWith("delete:done:"))
        .every(({ index }) => index < markerStartIndex),
    ).toBe(true);
    expect(calls.slice(-3)).toEqual([
      "meta:start",
      "meta:done",
      "kv:get-all",
    ]);
    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe('[{"id":"ordered-card"}]');
  });

  it("falls back when opening IndexedDB exceeds the settled timeout", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const reportError = vi.fn();
    const metaGet = vi.fn();
    vi.doMock("./services/errors/reporter.js", () => ({ reportError }));
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(() => new Promise(() => {})),
      flushWrites: vi.fn(async () => {}),
      kvGetAll: vi.fn(),
      kvPut: vi.fn(),
      kvDelete: vi.fn(),
      metaGet,
      metaPut: vi.fn(),
    }));
    store.set("mybishbash.cards.v1", '[{"id":"legacy-fallback"}]');

    const storage = await import("./storage.js");
    const hydration = storage.hydrateLocalData();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(hydration).resolves.toBeUndefined();

    expect(storage.getActiveStorageEngine()).toBe("localstorage");
    expect(storage.loadCards()).toEqual([{ id: "legacy-fallback" }]);
    expect(store.get(MIGRATION_RETRY_REQUEST_KEY)).toEqual(expect.any(String));
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();
    expect(metaGet).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "IndexedDB open timed out" }),
      "storage-engine-fallback",
    );
  });

  it("keeps recovery pending after a failed forced import, then reconciles exactly", async () => {
    vi.resetModules();

    const imported = new Map([
      ["mybishbash.cards.v1", '[{"id":"stale-idb"}]'],
      ["mybishbash.profile.v1", '{"name":"stale-idb"}'],
    ]);
    let failImport = true;
    let marker = { at: "2026-07-30T12:00:00.000Z", appVersion: "before-failure" };
    const kvPut = vi.fn(async (key, value) => {
      if (failImport && key === "mybishbash.profile.v1") throw new Error("forced migration failure");
      imported.set(key, value);
    });
    const kvDelete = vi.fn(async (key) => {
      imported.delete(key);
    });
    const metaPut = vi.fn(async (_key, value) => {
      marker = value;
    });
    const reportError = vi.fn();

    vi.doMock("./services/errors/reporter.js", () => ({ reportError }));
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites: vi.fn(async () => {}),
      kvGetAll: vi.fn(async () => new Map(imported)),
      kvPut,
      kvDelete,
      metaGet: vi.fn(async () => marker),
      metaPut,
    }));

    store.set(MIGRATION_RETRY_REQUEST_KEY, "retry-before-failure");
    store.set("mybishbash.cards.v1", '[{"id":"before-failure"}]');
    store.set("mybishbash.profile.v1", '{"name":"before-failure"}');

    const firstStorage = await import("./storage.js");
    await firstStorage.hydrateLocalData();

    expect(firstStorage.getActiveStorageEngine()).toBe("localstorage");
    expect(imported.get("mybishbash.cards.v1")).toBe('[{"id":"before-failure"}]');
    const failedImportToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(failedImportToken).toEqual(expect.any(String));
    expect(failedImportToken).not.toBe("retry-before-failure");
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();

    firstStorage.saveCards([{ id: "written-during-fallback" }]);
    firstStorage.removeStorageItem("mybishbash.profile.v1");
    const latestToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(latestToken).toEqual(expect.any(String));
    expect(latestToken).not.toBe(failedImportToken);

    failImport = false;
    vi.resetModules();
    const recoveredStorage = await import("./storage.js");
    await recoveredStorage.hydrateLocalData();

    expect(recoveredStorage.getActiveStorageEngine()).toBe("idb");
    expect(recoveredStorage.loadCards()).toEqual([{ id: "written-during-fallback" }]);
    expect(recoveredStorage.getStorageItem("mybishbash.profile.v1")).toBe(null);
    expect(imported.get("mybishbash.cards.v1")).toBe('[{"id":"written-during-fallback"}]');
    expect(imported.has("mybishbash.profile.v1")).toBe(false);
    expect(metaPut).toHaveBeenCalledOnce();
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBe(latestToken);
  });

  it("does not acknowledge a retry generation created after another hydration sampled state", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const marker = { at: "2026-07-30T12:00:00.000Z", appVersion: "test" };
    const imported = new Map([["mybishbash.cards.v1", '[{"id":"stale-idb"}]']]);
    let openAttempt = 0;
    let releaseSuccessfulRead;
    let readAttempt = 0;
    const openDb = vi.fn(() => {
      openAttempt += 1;
      return openAttempt === 1 ? new Promise(() => {}) : Promise.resolve();
    });
    const kvGetAll = vi.fn(() => {
      readAttempt += 1;
      if (readAttempt === 1) {
        return new Promise((resolve) => {
          releaseSuccessfulRead = () => resolve(new Map(imported));
        });
      }
      return Promise.resolve(new Map(imported));
    });
    const kvPut = vi.fn(async (key, value) => {
      imported.set(key, value);
    });
    const metaPut = vi.fn(async () => {});
    const reportError = vi.fn();

    vi.doMock("./services/errors/reporter.js", () => ({ reportError }));
    vi.doMock("./services/db/index.js", () => ({
      openDb,
      flushWrites: vi.fn(async () => {}),
      kvGetAll,
      kvPut,
      kvDelete: vi.fn(),
      metaGet: vi.fn(async () => marker),
      metaPut,
    }));
    store.set("mybishbash.cards.v1", '[{"id":"current-localstorage"}]');

    // Context A will time out, but not until context B has sampled the absence
    // of a retry request and paused on its mirror read.
    const failedStorage = await import("./storage.js");
    const failedHydration = failedStorage.hydrateLocalData();
    await vi.advanceTimersByTimeAsync(2500);

    vi.resetModules();
    const successfulStorage = await import("./storage.js");
    const successfulHydration = successfulStorage.hydrateLocalData();
    await vi.waitFor(() => expect(releaseSuccessfulRead).toEqual(expect.any(Function)));

    await vi.advanceTimersByTimeAsync(500);
    await failedHydration;
    const newRetryToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(newRetryToken).toEqual(expect.any(String));
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();

    releaseSuccessfulRead();
    await successfulHydration;
    // Context B must not activate the stale snapshot it read before context A
    // published a newer generation. It falls back to the current local source
    // for this session and advances the pending generation once more.
    expect(successfulStorage.getActiveStorageEngine()).toBe("localstorage");
    expect(successfulStorage.loadCards()).toEqual([{ id: "current-localstorage" }]);
    const concurrentFallbackToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(concurrentFallbackToken).toEqual(expect.any(String));
    expect(concurrentFallbackToken).not.toBe(newRetryToken);
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();

    // A third context sees the still-pending generation, force-imports the
    // current localStorage bytes despite the existing marker, then acknowledges
    // exactly that generation.
    vi.useRealTimers();
    vi.resetModules();
    const recoveredStorage = await import("./storage.js");
    await recoveredStorage.hydrateLocalData();

    expect(recoveredStorage.loadCards()).toEqual([{ id: "current-localstorage" }]);
    expect(kvPut).toHaveBeenCalledWith("mybishbash.cards.v1", '[{"id":"current-localstorage"}]');
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBe(concurrentFallbackToken);
  });
});

// ─── Round-trips, both engines ──────────────────────────────────────────────

describe("load/save round-trips", () => {
  it("legacy engine round-trips through localStorage only", async () => {
    const { storage, db } = await loadStorage({ engine: "localstorage" });

    storage.saveCards([{ id: "c1", title: "one" }]);
    storage.saveMood("Focused");
    storage.saveSetupComplete(true);

    expect(storage.loadCards()).toEqual([{ id: "c1", title: "one" }]);
    expect(storage.loadMood()).toBe("Focused");
    expect(storage.loadSetupComplete()).toBe(true);

    expect(store.get("mybishbash.cards.v1")).toBe('[{"id":"c1","title":"one"}]');
    // Nothing reached IndexedDB: the legacy path has no engine side effects.
    await db.flushWrites();
    expect(await db.kvGet("mybishbash.cards.v1")).toBe(null);
  });

  it("reconciles legacy-session edits and deletions when the kill switch returns to idb", async () => {
    store.set("mybishbash.cards.v1", '[{"id":"before-kill-switch"}]');
    store.set("mybishbash.profile.v1", '{"name":"before-kill-switch"}');
    const first = await loadStorage({ engine: "idb" });
    expect(first.storage.loadCards()).toEqual([{ id: "before-kill-switch" }]);

    store.set(ENGINE_KEY, "localstorage");
    vi.resetModules();
    const legacyStorage = await import("./storage.js");
    const legacyDb = await import("./services/db/index.js");
    await legacyStorage.hydrateLocalData();

    legacyStorage.saveCards([{ id: "edited-under-kill-switch" }]);
    legacyStorage.removeStorageItem("mybishbash.profile.v1");
    const latestToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(latestToken).toEqual(expect.any(String));
    expect(await legacyDb.kvGet("mybishbash.cards.v1")).toBe('[{"id":"before-kill-switch"}]');
    expect(await legacyDb.kvGet("mybishbash.profile.v1")).toBe('{"name":"before-kill-switch"}');

    store.delete(ENGINE_KEY);
    vi.resetModules();
    const recoveredStorage = await import("./storage.js");
    const recoveredDb = await import("./services/db/index.js");
    await recoveredStorage.hydrateLocalData();

    expect(recoveredStorage.getActiveStorageEngine()).toBe("idb");
    expect(recoveredStorage.loadCards()).toEqual([{ id: "edited-under-kill-switch" }]);
    expect(recoveredStorage.getStorageItem("mybishbash.profile.v1")).toBe(null);
    expect(await recoveredDb.kvGet("mybishbash.cards.v1")).toBe('[{"id":"edited-under-kill-switch"}]');
    expect(await recoveredDb.kvGet("mybishbash.profile.v1")).toBe(null);
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBe(latestToken);
  });

  it("idb engine round-trips synchronously off the hydrated mirror", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });

    storage.saveCards([{ id: "c1", title: "one" }]);
    storage.saveProfile({ name: "Lizzie" });

    // Reads are synchronous — no await between the save and the load.
    expect(storage.loadCards()).toEqual([{ id: "c1", title: "one" }]);
    expect(storage.loadProfile().name).toBe("Lizzie");

    // And they survive a fresh module + fresh hydration from IndexedDB alone.
    await db.flushWrites();
    store.delete("mybishbash.cards.v1");
    vi.resetModules();
    const reloaded = await import("./storage.js");
    await reloaded.hydrateLocalData();
    expect(reloaded.loadCards()).toEqual([{ id: "c1", title: "one" }]);
  });
});

// ─── Dual-write ─────────────────────────────────────────────────────────────

describe("dual-write (idb engine)", () => {
  it("a save lands in the mirror, IndexedDB and localStorage", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });

    storage.saveMood("Calm");

    // 1. mirror — the synchronous read
    expect(storage.loadMood()).toBe("Calm");
    // 2. localStorage — the rollback/kill-switch sink
    expect(store.get("mybishbash.mood.v1")).toBe("Calm");
    // 3. IndexedDB — the fire-and-forget write, once it has settled
    await db.flushWrites();
    expect(await db.kvGet("mybishbash.mood.v1")).toBe("Calm");
  });

  it("a removal clears all three sinks", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });

    storage.setStorageItem("mybishbash.mood.v1", "Calm");
    await db.flushWrites();
    storage.removeStorageItem("mybishbash.mood.v1");

    expect(storage.getStorageItem("mybishbash.mood.v1")).toBe(null);
    expect(store.has("mybishbash.mood.v1")).toBe(false);
    await db.flushWrites();
    expect(await db.kvGet("mybishbash.mood.v1")).toBe(null);
  });

  it("advances a pending recovery generation before an active IDB write can be acknowledged over", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });
    store.set(MIGRATION_RETRY_REQUEST_KEY, "generation-being-imported");

    storage.saveMood("Newer active-context value");

    const advancedToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(advancedToken).toEqual(expect.any(String));
    expect(advancedToken).not.toBe("generation-being-imported");
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();
    expect(storage.loadMood()).toBe("Newer active-context value");
    await db.flushWrites();
    expect(await db.kvGet("mybishbash.mood.v1")).toBe("Newer active-context value");
  });

  it("marks exact replay pending when a background IDB put or delete rejects", async () => {
    vi.resetModules();
    const kvPut = vi.fn(() => Promise.reject(new Error("quota put failure")));
    const kvDelete = vi.fn(() => Promise.reject(new Error("transaction delete failure")));
    const flushWrites = vi.fn(async () => {});
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites,
      kvGetAll: vi.fn(async () => new Map([["mybishbash.mood.v1", "Before"]])),
      kvPut,
      kvDelete,
      metaGet: vi.fn(async () => ({ at: "2026-07-30T12:00:00.000Z", appVersion: "test" })),
      metaPut: vi.fn(async () => {}),
    }));

    const storage = await import("./storage.js");
    await storage.hydrateLocalData();

    storage.saveMood("After failed put");
    await vi.waitFor(() => expect(store.get(MIGRATION_RETRY_REQUEST_KEY)).toEqual(expect.any(String)));
    const putFailureToken = store.get(MIGRATION_RETRY_REQUEST_KEY);
    expect(storage.loadMood()).toBe("After failed put");
    expect(store.get("mybishbash.mood.v1")).toBe("After failed put");

    storage.removeStorageItem("mybishbash.mood.v1");
    await vi.waitFor(() => expect(store.get(MIGRATION_RETRY_REQUEST_KEY)).not.toBe(putFailureToken));
    expect(storage.loadMood()).toBe("Minimal");
    expect(store.has("mybishbash.mood.v1")).toBe(false);

    // flushWrites intentionally settles failures; the per-write observer above
    // is what makes the localStorage dual-write recoverable on the next boot.
    await storage.flushPendingStorageWrites();
    expect(flushWrites).toHaveBeenCalledOnce();
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();
  });
});

describe("external-navigation write flush", () => {
  it("waits for the IDB write chain while the mirror is active", async () => {
    vi.resetModules();
    let releaseFlush;
    const flushWrites = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseFlush = resolve;
        }),
    );
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites,
      kvGetAll: vi.fn(async () => new Map()),
      kvPut: vi.fn(async () => {}),
      kvDelete: vi.fn(async () => {}),
      metaGet: vi.fn(async () => ({ at: "2026-07-30T12:00:00.000Z", appVersion: "test" })),
      metaPut: vi.fn(async () => {}),
    }));

    const storage = await import("./storage.js");
    await storage.hydrateLocalData();

    let settled = false;
    const pending = storage.flushPendingStorageWrites().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(flushWrites).toHaveBeenCalledOnce());
    expect(settled).toBe(false);

    releaseFlush();
    await pending;
    expect(settled).toBe(true);
  });

  it("bounds a stalled write flush and leaves exact replay pending", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const flushWrites = vi.fn(() => new Promise(() => {}));
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites,
      kvGetAll: vi.fn(async () => new Map()),
      kvPut: vi.fn(async () => {}),
      kvDelete: vi.fn(async () => {}),
      metaGet: vi.fn(async () => ({ at: "2026-07-30T12:00:00.000Z", appVersion: "test" })),
      metaPut: vi.fn(async () => {}),
    }));

    const storage = await import("./storage.js");
    await storage.hydrateLocalData();

    const pending = storage.flushPendingStorageWrites();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();
    expect(flushWrites).toHaveBeenCalledOnce();
    expect(store.get(MIGRATION_RETRY_REQUEST_KEY)).toEqual(expect.any(String));
    expect(store.get(MIGRATION_RETRY_ACK_KEY)).toBeUndefined();
  });

  it("does not touch IndexedDB while the legacy engine is active", async () => {
    vi.resetModules();
    const flushWrites = vi.fn(async () => {});
    vi.doMock("./services/db/index.js", () => ({
      openDb: vi.fn(async () => {}),
      flushWrites,
      kvGetAll: vi.fn(async () => new Map()),
      kvPut: vi.fn(async () => {}),
      kvDelete: vi.fn(async () => {}),
      metaGet: vi.fn(async () => null),
      metaPut: vi.fn(async () => {}),
    }));
    store.set(ENGINE_KEY, "localstorage");

    const storage = await import("./storage.js");
    await storage.hydrateLocalData();
    await storage.flushPendingStorageWrites();

    expect(flushWrites).not.toHaveBeenCalled();
  });
});

// ─── Legacy `bishbash.` prefix shim ─────────────────────────────────────────

describe("legacy-prefix lookup", () => {
  it("still reads and promotes under the legacy engine", async () => {
    const { storage } = await loadStorage({ engine: "localstorage" });
    store.set("bishbash.cards.v1", '[{"id":"legacy"}]');
    const tokenBeforePromotion = store.get(MIGRATION_RETRY_REQUEST_KEY);

    expect(storage.loadCards()).toEqual([{ id: "legacy" }]);
    expect(store.get("mybishbash.cards.v1")).toBe('[{"id":"legacy"}]');
    expect(store.get(MIGRATION_RETRY_REQUEST_KEY)).not.toBe(tokenBeforePromotion);
  });

  it("still reads and promotes under the idb engine", async () => {
    // Seed the legacy key into IndexedDB, then hydrate from it.
    vi.resetModules();
    const db = await import("./services/db/index.js");
    await db.deleteDb();
    await db.kvPut("bishbash.cards.v1", '[{"id":"legacy"}]');
    store.set(ENGINE_KEY, "idb");
    const storage = await import("./storage.js");
    await storage.hydrateLocalData();

    expect(storage.loadCards()).toEqual([{ id: "legacy" }]);
    // Promotion goes through the funnel, so it lands in every sink.
    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe('[{"id":"legacy"}]');
    expect(store.get("mybishbash.cards.v1")).toBe('[{"id":"legacy"}]');
    await db.flushWrites();
    expect(await db.kvGet("mybishbash.cards.v1")).toBe('[{"id":"legacy"}]');
  });
});

// ─── clearSharedMyBishBashState ─────────────────────────────────────────────

describe("clearSharedMyBishBashState", () => {
  it("clears localStorage and existing IDB state under the legacy engine without resurrection", async () => {
    const seeded = await loadStorage({ engine: "idb" });
    seeded.storage.saveCards([{ id: "must-stay-deleted" }]);
    seeded.storage.saveProfile({ name: "Must stay deleted" });
    await seeded.db.flushWrites();

    store.set(ENGINE_KEY, "localstorage");
    store.set("MYBISHBASH_E2E_MODE", "true");
    vi.resetModules();
    const storage = await import("./storage.js");
    const db = await import("./services/db/index.js");
    await storage.hydrateLocalData();

    await storage.clearSharedMyBishBashState();

    expect(store.has("mybishbash.cards.v1")).toBe(false);
    expect(store.has("mybishbash.profile.v1")).toBe(false);
    expect(await db.kvGet("mybishbash.cards.v1")).toBe(null);
    expect(await db.kvGet("mybishbash.profile.v1")).toBe(null);
    // Unowned flags are untouched — the reset set is unchanged by the seam.
    expect(store.get("MYBISHBASH_E2E_MODE")).toBe("true");

    store.delete(ENGINE_KEY);
    vi.resetModules();
    const reloaded = await import("./storage.js");
    await reloaded.hydrateLocalData();
    expect(reloaded.loadCards()).toEqual([]);
    expect(reloaded.getStorageItem("mybishbash.profile.v1")).toBe(null);
  }, 15_000);

  it("clears mirror, IndexedDB and localStorage under the idb engine", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });

    storage.saveCards([{ id: "c1" }]);
    storage.saveProfile({ name: "Lizzie" });
    storage.setStorageItem("mybishbash.event-log.v1", "[]");
    await db.flushWrites();

    await storage.clearSharedMyBishBashState();

    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe(null);
    expect(storage.getStorageItem("mybishbash.event-log.v1")).toBe(null);
    expect(store.has("mybishbash.cards.v1")).toBe(false);
    expect(store.has("mybishbash.profile.v1")).toBe(false);

    expect(await db.kvGet("mybishbash.cards.v1")).toBe(null);
    expect(await db.kvGet("mybishbash.profile.v1")).toBe(null);
    expect(await db.kvGet("mybishbash.event-log.v1")).toBe(null);

    // And the clear survives a re-hydration — nothing comes back from IDB.
    vi.resetModules();
    const reloaded = await import("./storage.js");
    await reloaded.hydrateLocalData();
    expect(reloaded.loadCards()).toEqual([]);
  });
});

// ─── Open-failure fallback ──────────────────────────────────────────────────

describe("open-failure fallback", () => {
  it("lands in legacy mode, reports, and still serves data", async () => {
    vi.resetModules();
    const reportError = vi.fn();
    vi.doMock("./services/errors/reporter.js", () => ({ reportError }));
    vi.doMock("./services/db/index.js", () => ({
      openDb: () => Promise.reject(new Error("forced open failure")),
      flushWrites: vi.fn(async () => {}),
      kvGetAll: () => Promise.reject(new Error("unreachable")),
      kvPut: vi.fn(),
      kvDelete: vi.fn(),
      metaGet: vi.fn(),
      metaPut: vi.fn(),
    }));

    store.set(ENGINE_KEY, "idb");
    store.set("mybishbash.cards.v1", '[{"id":"from-localstorage"}]');

    const storage = await import("./storage.js");
    // Hydration must RESOLVE, never reject — the app must not hang on boot.
    await expect(storage.hydrateLocalData()).resolves.toBeUndefined();

    expect(storage.getActiveStorageEngine()).toBe("localstorage");
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(reportError.mock.calls[0][0].message).toBe("forced open failure");
    expect(reportError.mock.calls[0][1]).toBe("storage-engine-fallback");

    // The app boots from localStorage — fresh, thanks to dual-write.
    expect(storage.loadCards()).toEqual([{ id: "from-localstorage" }]);

    // And writes go to localStorage only, with no engine side effects.
    storage.saveMood("Calm");
    expect(store.get("mybishbash.mood.v1")).toBe("Calm");
  });
});
