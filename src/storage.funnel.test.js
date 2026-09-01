/**
 * Phase 5 commit 1.5 — one focused test per storage path that used to bypass
 * the funnel in src/storage.js.
 *
 * WHAT THESE TESTS PIN, AND WHY IT IS NOT "THE TEXT CHANGED":
 *
 * The funnel is not a naming convention — it has an observable contract that
 * direct `window.localStorage.getItem` does not implement: the legacy
 * `bishbash.`-prefix shim. A key whose value was written by a legacy build is
 * (a) still readable, and (b) promoted to the modern key on first read.
 *
 * So every test below seeds ONLY the legacy key and asserts the caller sees
 * the data and that the promotion write happened. Restoring direct
 * localStorage access at any of these sites makes real user data invisible —
 * a behavioural failure (wrong value returned, missing write), not a
 * string-moved failure. A test that merely spied on which function was called
 * would fail for the latter reason and is deliberately not used here.
 *
 * The one honest exception is `clearSharedMyBishBashState`, documented at its
 * test: routing its removal loop through `removeStorageItem` is
 * behaviour-preserving by construction and NO mutation can distinguish the two
 * today. Its test therefore pins the property that can regress — the exact
 * removal set — rather than pretending to prove something it cannot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let store = new Map();

vi.stubGlobal("window", {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  },
});

vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });

beforeEach(() => {
  store = new Map();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 5, 1, 12, 0, 0));
});

// ─── 1. app-pauses ──────────────────────────────────────────────────────────

describe("app-pauses reads and writes through the funnel", () => {
  it("round-trips a pause through the public API", async () => {
    const { pauseApp, isAppPaused, getAppPauseExpiry, clearAppPause } = await import("./storage.js");

    const expiry = pauseApp("instagram", 30);
    expect(expiry).toBe("2026-06-01T12:30:00.000Z");
    expect(store.get("mybishbash.app-pauses.v1")).toBe('{"instagram":"2026-06-01T12:30:00.000Z"}');
    expect(getAppPauseExpiry("instagram")).toBe(expiry);
    expect(isAppPaused("instagram")).toBe(true);

    clearAppPause("instagram");
    expect(store.get("mybishbash.app-pauses.v1")).toBe("{}");
    expect(isAppPaused("instagram")).toBe(false);
  });

  it("expires a pause without disturbing the others", async () => {
    const { pauseApp, clearExpiredAppPause, isAppPaused } = await import("./storage.js");
    pauseApp("instagram", 30);
    pauseApp("youtube", 5);

    vi.setSystemTime(Date.UTC(2026, 5, 1, 12, 10, 0));
    clearExpiredAppPause("youtube");

    expect(store.get("mybishbash.app-pauses.v1")).toBe('{"instagram":"2026-06-01T12:30:00.000Z"}');
    expect(isAppPaused("instagram")).toBe(true);
  });

  // MEANINGFUL PROPERTY: a pause written by a legacy-prefix build must remain
  // visible and must be promoted to the modern key. Direct getItem/setItem
  // here silently loses the pause — the app would launch an app the user had
  // paused.
  it("sees and promotes a legacy-prefixed pauses map", async () => {
    const { isAppPaused, getAppPauseExpiry } = await import("./storage.js");
    store.set("bishbash.app-pauses.v1", '{"instagram":"2026-06-01T12:30:00.000Z"}');

    expect(getAppPauseExpiry("instagram")).toBe("2026-06-01T12:30:00.000Z");
    expect(isAppPaused("instagram")).toBe(true);
    expect(store.get("mybishbash.app-pauses.v1")).toBe('{"instagram":"2026-06-01T12:30:00.000Z"}');
  });

  it("writes a legacy-seeded pause forward under the modern key only", async () => {
    const { pauseApp } = await import("./storage.js");
    store.set("bishbash.app-pauses.v1", '{"instagram":"2026-06-01T12:30:00.000Z"}');

    pauseApp("youtube", 10);

    expect(JSON.parse(store.get("mybishbash.app-pauses.v1"))).toEqual({
      instagram: "2026-06-01T12:30:00.000Z",
      youtube: "2026-06-01T12:10:00.000Z",
    });
    // The legacy key is a read-only source; the shim never rewrites it.
    expect(store.get("bishbash.app-pauses.v1")).toBe('{"instagram":"2026-06-01T12:30:00.000Z"}');
  });
});

// ─── 2. shared-state clearing ───────────────────────────────────────────────

describe("clearSharedMyBishBashState", () => {
  /**
   * This test pins the local removal set: all 20 shared keys, all 20 legacy
   * twins, and nothing else. `storage.engine.test.js` separately seeds and
   * verifies mirror + IndexedDB state under both engines, including a reload,
   * so the all-sink clear guarantee is no longer asserted vacuously here.
   */
  it("removes every shared key and its legacy twin, and nothing else", async () => {
    const { clearSharedMyBishBashState } = await import("./storage.js");
    const shared = [
      "cards", "setup-complete", "mood", "profile", "home-screen-versions",
      "home-screen-selected", "card-packs", "hidden-library-packs",
      "disliked-pack-card-ids", "global-interruption-mode",
      "launcher-behavior-settings", "action-cards",
      "action-card-defaults-version", "notifications", "notification-schedule",
      "app-pauses", "timing-windows-prefs", "event-log", "offline-event-queue",
      "user-id",
    ];
    for (const name of shared) {
      store.set(`mybishbash.${name}.v1`, "seeded");
      store.set(`bishbash.${name}.v1`, "seeded-legacy");
    }
    store.set("MYBISHBASH_E2E_MODE", "true");
    store.set("mybishbash.commitmentDebug.v1", "[]");
    store.set("mybishbash.storage-engine.v1", "localstorage");

    clearSharedMyBishBashState();

    for (const name of shared) {
      expect(store.has(`mybishbash.${name}.v1`), `${name} not cleared`).toBe(false);
      expect(store.has(`bishbash.${name}.v1`), `legacy ${name} not cleared`).toBe(false);
    }
    expect([...store.keys()].sort()).toEqual([
      "MYBISHBASH_E2E_MODE",
      "mybishbash.commitmentDebug.v1",
      "mybishbash.storage-engine.v1",
    ]);
  });
});

// ─── 3. event logging ───────────────────────────────────────────────────────

describe("eventLog uses storage.js's funnel, not a private copy", () => {
  it("round-trips the log, the offline queue and the user id", async () => {
    const eventLog = await import("./eventLog.js");

    expect(eventLog.getUserId()).toBe("11111111-1111-4111-8111-111111111111");
    expect(store.get("mybishbash.user-id.v1")).toBe("11111111-1111-4111-8111-111111111111");

    eventLog.saveEventLog([{ id: "e1", created_at: "2026-06-01T10:00:00.000Z" }]);
    expect(eventLog.loadEventLog()).toEqual([{ id: "e1", created_at: "2026-06-01T10:00:00.000Z" }]);

    eventLog.saveOfflineEventQueue([{ id: "e1" }]);
    expect(eventLog.loadOfflineEventQueue()).toEqual([{ id: "e1" }]);
  });

  // MEANINGFUL PROPERTY: the shim must apply to all three event-log keys, and
  // it must be THE shim in storage.js. Before commit 1.5 this passed against a
  // private duplicate; the value of the change is that there is now one
  // implementation that cannot drift from the one storage.js uses. Direct
  // localStorage here loses a legacy user's identity and their whole log.
  it("sees and promotes legacy-prefixed event-log keys", async () => {
    const eventLog = await import("./eventLog.js");
    store.set("bishbash.user-id.v1", "legacy-user");
    store.set("bishbash.event-log.v1", '[{"id":"legacy-event"}]');
    store.set("bishbash.offline-event-queue.v1", '[{"id":"legacy-queued"}]');

    expect(eventLog.getUserId()).toBe("legacy-user");
    expect(eventLog.loadEventLog()).toEqual([{ id: "legacy-event" }]);
    expect(eventLog.loadOfflineEventQueue()).toEqual([{ id: "legacy-queued" }]);

    expect(store.get("mybishbash.user-id.v1")).toBe("legacy-user");
    expect(store.get("mybishbash.event-log.v1")).toBe('[{"id":"legacy-event"}]');
    expect(store.get("mybishbash.offline-event-queue.v1")).toBe('[{"id":"legacy-queued"}]');
  });

  it("shares one funnel with storage.js — a value written by either is read by both", async () => {
    const eventLog = await import("./eventLog.js");
    const storage = await import("./storage.js");
    store.set("bishbash.event-log.v1", '[{"id":"legacy-event"}]');

    // storage.js's funnel promotes it...
    expect(storage.getStorageItem("mybishbash.event-log.v1")).toBe('[{"id":"legacy-event"}]');
    // ...and eventLog reads the promoted value, with no second promotion write.
    store.delete("bishbash.event-log.v1");
    expect(eventLog.loadEventLog()).toEqual([{ id: "legacy-event" }]);
  });
});

// ─── 4. settings hydration ──────────────────────────────────────────────────

describe("settingsStore explicit launcher-behavior hydration", () => {
  it("returns the raw stored settings without merging defaults", async () => {
    const { loadExplicitLauncherBehaviorSettings } = await import("./stores/settingsStore.js");
    store.set(
      "mybishbash.launcher-behavior-settings.v1",
      '{"instagram":{"interruptionPaused":true}}',
    );

    expect(loadExplicitLauncherBehaviorSettings()).toEqual({
      instagram: { interruptionPaused: true },
    });
  });

  // MEANINGFUL PROPERTY: a legacy user's explicit launcher behaviour must be
  // visible to the store initializer. With direct getItem the store hydrates
  // `{}` and the user's interruption settings appear reset.
  it("sees and promotes legacy-prefixed launcher-behavior settings", async () => {
    const { loadExplicitLauncherBehaviorSettings } = await import("./stores/settingsStore.js");
    store.set("bishbash.launcher-behavior-settings.v1", '{"youtube":{"interruptionPaused":true}}');

    expect(loadExplicitLauncherBehaviorSettings()).toEqual({
      youtube: { interruptionPaused: true },
    });
    expect(store.get("mybishbash.launcher-behavior-settings.v1")).toBe(
      '{"youtube":{"interruptionPaused":true}}',
    );
  });

  it("tolerates absent and malformed values", async () => {
    const { loadExplicitLauncherBehaviorSettings } = await import("./stores/settingsStore.js");
    expect(loadExplicitLauncherBehaviorSettings()).toEqual({});
    store.set("mybishbash.launcher-behavior-settings.v1", "not json");
    expect(loadExplicitLauncherBehaviorSettings()).toEqual({});
  });
});

// ─── 5. the E2E shared-state bridge ─────────────────────────────────────────

describe("the E2E shared-state bridge reads production keys through the funnel", () => {
  it("stays inert outside E2E auth-mock mode", async () => {
    const sync = await import("./lib/mybishbashSync.js");
    store.set("mybishbash.setup-complete.v1", "true");

    // Not mock mode → the bridge is not consulted at all; Supabase is absent
    // in unit tests, so the attempt to use it is the proof it never read
    // localStorage.
    await expect(sync.loadSharedState("user-1")).rejects.toThrow(/Supabase is not configured/);
  });

  it("hydrates shared state from production keys", async () => {
    const sync = await import("./lib/mybishbashSync.js");
    store.set("MYBISHBASH_E2E_AUTH_MOCK", "true");
    store.set("mybishbash.setup-complete.v1", "true");
    store.set("mybishbash.cards.v1", '[{"id":"c1"}]');
    store.set("mybishbash.mood.v1", "Calm");
    store.set("mybishbash.global-interruption-mode.v1", "false");
    store.set("mybishbash.event-log.v1", '[{"id":"e1"}]');

    const state = await sync.loadSharedState("user-1");

    expect(state.setupComplete).toBe(true);
    expect(state.cards).toEqual([{ id: "c1" }]);
    expect(state.mood).toBe("Calm");
    expect(state.globalInterruptionMode).toBe(false);
    expect(state.events).toEqual([{ id: "e1" }]);
    expect(state.cardPacks).toEqual([]);
  });

  // MEANINGFUL PROPERTY: with direct getItem the bridge cannot see a legacy
  // profile at all — `setup-complete` reads null, the bridge returns null and
  // loadSharedState THROWS "E2E shared profile has not been created yet",
  // which is a hard failure, not a cosmetic one.
  it("sees and promotes a legacy-prefixed profile", async () => {
    const sync = await import("./lib/mybishbashSync.js");
    store.set("MYBISHBASH_E2E_AUTH_MOCK", "true");
    store.set("bishbash.setup-complete.v1", "true");
    store.set("bishbash.cards.v1", '[{"id":"legacy-card"}]');
    store.set("bishbash.mood.v1", "Calm");

    const state = await sync.loadSharedState("user-1");

    expect(state.setupComplete).toBe(true);
    expect(state.cards).toEqual([{ id: "legacy-card" }]);
    expect(state.mood).toBe("Calm");
    expect(store.get("mybishbash.setup-complete.v1")).toBe("true");
    expect(store.get("mybishbash.cards.v1")).toBe('[{"id":"legacy-card"}]');
  });

  it("prefers an explicitly saved E2E shared-state blob over the production keys", async () => {
    const sync = await import("./lib/mybishbashSync.js");
    store.set("MYBISHBASH_E2E_AUTH_MOCK", "true");
    store.set("mybishbash.setup-complete.v1", "true");
    store.set("MYBISHBASH_E2E_SHARED_STATE", '{"version":1,"cards":[{"id":"blob"}]}');

    const state = await sync.loadSharedState("user-1");
    expect(state.cards).toEqual([{ id: "blob" }]);
  });
});
