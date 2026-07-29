/**
 * Phase 5 commit 1.5 — byte-identity harness for the storage-funnel unification.
 *
 * Commit 1.5 routes five previously-bypassing storage paths through
 * `getStorageItem`/`setStorageItem`/`removeStorageItem` in `src/storage.js`.
 * It is a PURE REFACTOR: the bytes that reach localStorage must not move.
 *
 * This harness drives each affected path through its PUBLIC API against a
 * recording localStorage stub and snapshots:
 *
 *   writes  — the exact ordered log of setItem/removeItem calls (key + value)
 *   final   — the complete resulting store, key by key, byte for byte
 *   reads   — the ordered getItem log, RECORDED FOR INFORMATION, NOT ASSERTED
 *
 * `writes` + `final` are the persistence contract: identical keys, identical
 * values, identical removals, no new persistence side effects. Those two are
 * compared strictly against a baseline captured at the pre-refactor commit.
 *
 * `reads` is deliberately not asserted, and the reason is recorded here rather
 * than hidden: routing `app-pauses` (and the settings/sync reads) through the
 * funnel adds a *read* of the `bishbash.`-prefixed legacy key when the modern
 * key is absent. A read of an absent key persists nothing, so it cannot change
 * the bytes; the fixture keeps the read logs so any change to them is visible
 * in review even though it does not fail the build. Every scenario below is
 * seeded so no legacy key is present, which is the state git history says
 * every real profile is in (`bishbash.app-pauses.v1` has never been written by
 * any build). The legacy-shim behaviour itself is asserted, positively, in
 * `src/storage.funnel.test.js`.
 *
 *   Capture:  MYBISHBASH_STORAGE_BYTES_BASELINE=1 npx vitest run src/storage.funnel.bytes.test.js
 *   Compare:  npx vitest run src/storage.funnel.bytes.test.js
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/storage-funnel-bytes.baseline.json",
);
const CAPTURING = process.env.MYBISHBASH_STORAGE_BYTES_BASELINE === "1";

const FIXED_NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

let store = new Map();
let log = [];

function recordingLocalStorage() {
  return {
    getItem(key) {
      const value = store.has(key) ? store.get(key) : null;
      log.push(["get", key, value]);
      return value;
    },
    setItem(key, value) {
      store.set(key, String(value));
      log.push(["set", key, String(value)]);
    },
    removeItem(key) {
      store.delete(key);
      log.push(["remove", key]);
    },
    clear() {
      store.clear();
      log.push(["clear"]);
    },
  };
}

vi.stubGlobal("window", { localStorage: recordingLocalStorage() });

let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
});

/** Seed without touching the log — seeding is the fixture, not the behaviour. */
function seed(entries) {
  for (const [key, value] of Object.entries(entries)) store.set(key, value);
}

function snapshot() {
  return {
    writes: log.filter((entry) => entry[0] !== "get"),
    reads: log.filter((entry) => entry[0] === "get"),
    final: Object.fromEntries([...store.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

const captured = {};

function record(name, taken) {
  captured[name] = taken;
  if (CAPTURING) return;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))[name];
  expect(baseline, `no baseline recorded for scenario "${name}"`).toBeTruthy();
  expect(taken.writes, `localStorage WRITES drifted for "${name}" — commit 1.5 is not a pure refactor`).toEqual(
    baseline.writes,
  );
  expect(taken.final, `final localStorage BYTES drifted for "${name}" — commit 1.5 is not a pure refactor`).toEqual(
    baseline.final,
  );
}

afterAll(() => {
  if (!CAPTURING) return;
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  const existing = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...existing, ...captured }, null, 2)}\n`);
});

beforeEach(() => {
  store = new Map();
  log = [];
  uuidCounter = 0;
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

const SHARED_SEED = {
  "mybishbash.cards.v1": '[{"id":"c1","promptText":"breathe"}]',
  "mybishbash.setup-complete.v1": "true",
  "mybishbash.mood.v1": "Minimal",
  "mybishbash.profile.v1": '{"name":"E2E","timezone":"Europe/London","plan":"free"}',
  "mybishbash.home-screen-versions.v1": '{"mybishbash":{"id":"mybishbash"}}',
  "mybishbash.home-screen-selected.v1": "mybishbash",
  "mybishbash.card-packs.v1": '[{"id":"p1"}]',
  "mybishbash.hidden-library-packs.v1": '["p2"]',
  "mybishbash.disliked-pack-card-ids.v1": '["pc1"]',
  "mybishbash.global-interruption-mode.v1": "true",
  "mybishbash.launcher-behavior-settings.v1": '{"instagram":{"interruptionPaused":true}}',
  "mybishbash.action-cards.v1": '[{"id":"ac-1"}]',
  "mybishbash.action-card-defaults-version.v1": "2026-05-13",
  "mybishbash.notifications.v1": '{"enabled":false,"notificationsPerDay":3}',
  "mybishbash.notification-schedule.v1": '{"date":"","targets":[],"sentCount":0,"lastSentAt":null}',
  "mybishbash.app-pauses.v1": '{"instagram":"2099-01-01T00:00:00.000Z"}',
  "mybishbash.timing-windows-prefs.v1": "[]",
  "mybishbash.event-log.v1": '[{"id":"e1"}]',
  "mybishbash.offline-event-queue.v1": "[]",
  "mybishbash.user-id.v1": "user-1",
};

describe("storage funnel — byte identity", () => {
  it("app-pauses lifecycle writes identical bytes", async () => {
    const storage = await import("./storage.js");
    seed({ "mybishbash.app-pauses.v1": '{"youtube":"2026-06-01T11:00:00.000Z"}' });

    storage.pauseApp("instagram", 30);
    storage.getAppPauseExpiry("instagram");
    storage.isAppPaused("instagram");
    storage.isAppPaused("youtube"); // already expired at FIXED_NOW
    storage.clearExpiredAppPause("youtube"); // expired → deletes the entry
    storage.clearExpiredAppPause("instagram"); // still paused → no write
    storage.pauseApp("safari", 5);
    storage.clearAppPause("safari");
    storage.clearAppPause("whatsapp"); // absent → no write
    storage.pauseApp("", 30); // guard → no write
    storage.pauseApp("tiktok", 0); // guard → no write

    record("app-pauses", snapshot());
  });

  it("clearSharedMyBishBashState removes identical keys", async () => {
    const storage = await import("./storage.js");
    seed({
      ...SHARED_SEED,
      "bishbash.cards.v1": "[]",
      "bishbash.user-id.v1": "legacy-user",
      "bishbash.app-pauses.v1": "{}",
      MYBISHBASH_E2E_MODE: "true",
      "mybishbash.commitmentDebug.v1": "[]",
    });

    storage.clearSharedMyBishBashState();

    record("clear-shared-state", snapshot());
  });

  it("event logging writes identical bytes", async () => {
    const eventLog = await import("./eventLog.js");
    seed({ "mybishbash.event-log.v1": "[]", "mybishbash.offline-event-queue.v1": "[]" });

    const first = eventLog.getUserId(); // absent → generates + persists
    const second = eventLog.getUserId(); // present → no write
    expect(first).toBe(second);

    eventLog.saveEventLog([{ id: "e1", created_at: "2026-06-01T10:00:00.000Z" }]);
    eventLog.loadEventLog();
    eventLog.saveOfflineEventQueue([{ id: "e1" }]);
    eventLog.loadOfflineEventQueue();

    record("event-log", snapshot());
  });

  it("event logging promotes a legacy-prefixed user id identically", async () => {
    const eventLog = await import("./eventLog.js");
    seed({ "bishbash.user-id.v1": "legacy-user-id" });

    expect(eventLog.getUserId()).toBe("legacy-user-id");

    record("event-log-legacy-user-id", snapshot());
  });

  it("settings hydration reads identical bytes", async () => {
    const settingsStore = await import("./stores/settingsStore.js");
    seed(SHARED_SEED);

    settingsStore.loadExplicitLauncherBehaviorSettings();

    record("settings-explicit-launcher-behavior", snapshot());
  });

  it("the E2E shared-state bridge writes identical bytes", async () => {
    const sync = await import("./lib/mybishbashSync.js");
    seed({ ...SHARED_SEED, MYBISHBASH_E2E_AUTH_MOCK: "true" });

    const state = await sync.loadSharedState("user-1");
    expect(state.setupComplete).toBe(true);
    expect(state.cards).toEqual([{ id: "c1", promptText: "breathe" }]);

    record("sync-shared-state-bridge", snapshot());
  });
});
