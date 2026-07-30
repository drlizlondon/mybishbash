/**
 * Phase 5 commit 2 — the persistence engine seam in src/storage.js.
 *
 * The seam routes the single funnel (getStorageItem / setStorageItem /
 * removeStorageItem) by engine. This file pins the matrix the packet asks for:
 *
 *   legacy  × load/save round-trip           — unchanged behaviour, the default
 *   idb     × load/save round-trip           — synchronous reads off the mirror
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
  vi.doUnmock("./services/db/index.js");
  vi.doUnmock("./services/errors/reporter.js");
});

// ─── Engine selection ───────────────────────────────────────────────────────

describe("engine selection", () => {
  it("defaults to the legacy engine with no kill-switch key present", async () => {
    const { storage } = await loadStorage();
    expect(storage.getActiveStorageEngine()).toBe("localstorage");
  });

  it("honours the kill switch in both directions", async () => {
    const idb = await loadStorage({ engine: "idb" });
    expect(idb.storage.getActiveStorageEngine()).toBe("idb");

    const legacy = await loadStorage({ engine: "localstorage" });
    expect(legacy.storage.getActiveStorageEngine()).toBe("localstorage");
  });

  it("ignores an unrecognised kill-switch value and uses the default", async () => {
    const { storage } = await loadStorage({ engine: "postgres" });
    expect(storage.getActiveStorageEngine()).toBe("localstorage");
  });

  it("hydrateLocalData resolves immediately in legacy mode and is idempotent", async () => {
    const { storage } = await loadStorage();
    const first = storage.hydrateLocalData();
    expect(first).toBe(storage.hydrateLocalData());
    await expect(first).resolves.toBeUndefined();
  });
});

// ─── Round-trips, both engines ──────────────────────────────────────────────

describe("load/save round-trips", () => {
  it("legacy engine round-trips through localStorage only", async () => {
    const { storage, db } = await loadStorage();

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
});

// ─── Legacy `bishbash.` prefix shim ─────────────────────────────────────────

describe("legacy-prefix lookup", () => {
  it("still reads and promotes under the legacy engine", async () => {
    const { storage } = await loadStorage();
    store.set("bishbash.cards.v1", '[{"id":"legacy"}]');

    expect(storage.loadCards()).toEqual([{ id: "legacy" }]);
    expect(store.get("mybishbash.cards.v1")).toBe('[{"id":"legacy"}]');
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
  it("clears localStorage under the legacy engine", async () => {
    const { storage } = await loadStorage();
    store.set("mybishbash.cards.v1", "[]");
    store.set("bishbash.profile.v1", "{}");
    store.set("MYBISHBASH_E2E_MODE", "true");

    storage.clearSharedMyBishBashState();

    expect(store.has("mybishbash.cards.v1")).toBe(false);
    expect(store.has("bishbash.profile.v1")).toBe(false);
    // Unowned flags are untouched — the reset set is unchanged by the seam.
    expect(store.get("MYBISHBASH_E2E_MODE")).toBe("true");
  });

  it("clears mirror, IndexedDB and localStorage under the idb engine", async () => {
    const { storage, db } = await loadStorage({ engine: "idb" });

    storage.saveCards([{ id: "c1" }]);
    storage.saveProfile({ name: "Lizzie" });
    storage.setStorageItem("mybishbash.event-log.v1", "[]");
    await db.flushWrites();

    storage.clearSharedMyBishBashState();

    expect(storage.getStorageItem("mybishbash.cards.v1")).toBe(null);
    expect(storage.getStorageItem("mybishbash.event-log.v1")).toBe(null);
    expect(store.has("mybishbash.cards.v1")).toBe(false);
    expect(store.has("mybishbash.profile.v1")).toBe(false);

    await db.flushWrites();
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
      kvGetAll: () => Promise.reject(new Error("unreachable")),
      kvPut: vi.fn(),
      kvDelete: vi.fn(),
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
