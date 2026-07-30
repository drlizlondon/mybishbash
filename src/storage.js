import { FAKE_APP_LAUNCHERS, LAUNCHER_REGISTRY, mergeLauncherConfig } from "./lib/launcherRegistry";
import { rebase } from "./lib/basePath";
import { flushWrites, kvDelete, kvGetAll, kvPut, metaGet, metaPut, openDb } from "./services/db/index.js";

const STORAGE_KEY = "mybishbash.cards.v1";
const SETUP_KEY = "mybishbash.setup-complete.v1";
const MOOD_KEY = "mybishbash.mood.v1";
const PROFILE_KEY = "mybishbash.profile.v1";
const HOME_SCREEN_VERSIONS_KEY = "mybishbash.home-screen-versions.v1";
const HOME_SCREEN_SELECTED_KEY = "mybishbash.home-screen-selected.v1";
const CARD_PACKS_KEY = "mybishbash.card-packs.v1";
const HIDDEN_LIBRARY_PACKS_KEY = "mybishbash.hidden-library-packs.v1";
const DISLIKED_PACK_CARD_IDS_KEY = "mybishbash.disliked-pack-card-ids.v1";
const GLOBAL_INTERRUPTION_MODE_KEY = "mybishbash.global-interruption-mode.v1";
const LAUNCHER_BEHAVIOR_SETTINGS_KEY = "mybishbash.launcher-behavior-settings.v1";
const ACTION_CARDS_KEY = "mybishbash.action-cards.v1";
const ACTION_CARD_DEFAULTS_VERSION_KEY = "mybishbash.action-card-defaults-version.v1";
const NOTIFICATIONS_KEY = "mybishbash.notifications.v1";
const NOTIFICATION_SCHEDULE_KEY = "mybishbash.notification-schedule.v1";
const APP_PAUSES_KEY = "mybishbash.app-pauses.v1";
const TIMING_WINDOWS_PREFS_KEY = "mybishbash.timing-windows-prefs.v1";
const ACTION_CARD_DEFAULTS_VERSION = "2026-05-13";
const STORAGE_PREFIX = "mybishbash";
const LEGACY_STORAGE_PREFIX = "bish" + "bash";

function getLegacyStorageKey(key) {
  return key.startsWith(`${STORAGE_PREFIX}.`) ? key.replace(`${STORAGE_PREFIX}.`, `${LEGACY_STORAGE_PREFIX}.`) : null;
}

// ─── The single local read/write funnel ─────────────────────────────────────
// Phase 5 commit 1.5: these three are THE storage funnel for every production
// storage key in the app. They are exported (rather than module-private) so
// that eventLog.js, stores/settingsStore.js and lib/mybishbashSync.js route
// through them instead of carrying private duplicates or direct
// `window.localStorage` calls — see docs/architecture/phase-05-indexeddb.md
// "Commit 1.5". Nothing outside this file may touch a production storage key
// directly; when the persistence engine seam lands (commit 2) these three
// functions are the only place it has to be introduced.

export function getStorageItem(key) {
  if (isMirrorActive()) return getMirrorItem(key);
  return getLocalStorageItem(key);
}

export function setStorageItem(key, value) {
  if (isMirrorActive()) {
    const stringValue = String(value);
    mirror.set(key, stringValue);
    queueIdbWrite(() => kvPut(key, stringValue));
    // Dual-write (R2): localStorage stays current for the whole transition
    // release so the kill switch and a build rollback lose nothing. Retired in
    // commit 6, one release after the cutover.
    window.localStorage.setItem(key, stringValue);
    markIdbMutationDuringReconciliation();
    return;
  }
  window.localStorage.setItem(key, value);
  markLegacyMutationForReconciliation();
}

export function removeStorageItem(key) {
  if (isMirrorActive()) {
    mirror.delete(key);
    queueIdbWrite(() => kvDelete(key));
    window.localStorage.removeItem(key);
    markIdbMutationDuringReconciliation();
    return;
  }
  window.localStorage.removeItem(key);
  markLegacyMutationForReconciliation();
}

// ─── The persistence engine seam (Phase 5, commit 2) ─────────────────────────
//
// The three funnel functions above route by ENGINE. Everything below is that
// routing, and nothing above this line in the file has changed shape: the
// legacy path performs exactly the same localStorage calls, in the same order,
// with the same arguments, as it did before the seam existed
// (`src/storage.funnel.bytes.test.js` compares it byte for byte).
//
//   "localstorage" — owned-key reads/writes remain `window.localStorage`
//        byte-for-byte. Once hydration has selected this engine, an out-of-band
//        retry generation also records that localStorage is authoritative so a
//        later return to IDB cannot load stale data.
//   "idb" (default) — an in-memory mirror seeded by
//        `hydrateLocalData()`; reads are synchronous Map lookups, writes update
//        the mirror synchronously, then fire-and-forget `kvPut`/`kvDelete` into
//        IndexedDB (per-key ordered by services/db's write chain), and ALSO
//        write localStorage for the dual-write transition release.
//
// Engine selection: the kill switch `mybishbash.storage-engine.v1` (values
// "idb" / "localstorage") wins if present; otherwise DEFAULT_STORAGE_ENGINE.
// The switch key itself is read straight from localStorage on purpose — it is
// the thing that decides where owned keys live, so it cannot live behind the
// decision (Ruling R1: pre-hydration flags stay on localStorage).
//
// On the first idb boot, hydration imports the raw localStorage bytes before it
// seeds the mirror. localStorage remains current through dual-write so the kill
// switch and a build rollback retain the complete transition-release state.

const STORAGE_ENGINE_KEY = "mybishbash.storage-engine.v1";
const MIGRATION_RETRY_REQUEST_KEY = "mybishbash.storage-migration-retry.v1";
const MIGRATION_RETRY_ACK_KEY = "mybishbash.storage-migration-retry-ack.v1";
const MIGRATION_META_KEY = "migratedFromLocalStorage";
const DEFAULT_STORAGE_ENGINE = "idb";
const HYDRATION_TIMEOUT_MS = 3000;
const WRITE_FLUSH_TIMEOUT_MS = 1000;

let activeEngine = null;
let mirror = null;
let hydrationPromise = null;
let isClearingSharedState = false;

function getLocalStorageItem(key) {
  const value = window.localStorage.getItem(key);
  if (value !== null) return value;

  const legacyKey = getLegacyStorageKey(key);
  if (!legacyKey) return null;

  const legacyValue = window.localStorage.getItem(legacyKey);
  if (legacyValue !== null) {
    window.localStorage.setItem(key, legacyValue);
    markLegacyMutationForReconciliation();
  }
  return legacyValue;
}

// The mirror's read path is the same contract as the legacy one, including the
// legacy-prefix shim and its promotion write — promotion goes back through
// setStorageItem so it lands in every sink the active engine owns.
function getMirrorItem(key) {
  const value = mirror.get(key);
  if (value !== undefined && value !== null) return value;

  const legacyKey = getLegacyStorageKey(key);
  if (!legacyKey) return null;

  const legacyValue = mirror.get(legacyKey);
  if (legacyValue === undefined || legacyValue === null) return null;
  setStorageItem(key, legacyValue);
  return legacyValue;
}

function readEngineOverride() {
  try {
    const raw = window.localStorage.getItem(STORAGE_ENGINE_KEY);
    return raw === "idb" || raw === "localstorage" ? raw : null;
  } catch {
    return null;
  }
}

function readMigrationRetry() {
  try {
    const token = window.localStorage.getItem(MIGRATION_RETRY_REQUEST_KEY);
    const acknowledgedToken = window.localStorage.getItem(MIGRATION_RETRY_ACK_KEY);
    return {
      token,
      pending: token !== null && token !== acknowledgedToken,
    };
  } catch {
    return { token: null, pending: false };
  }
}

function markMigrationRetry() {
  try {
    const token =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(MIGRATION_RETRY_REQUEST_KEY, token);
  } catch {
    // A failed control-key write must not prevent the legacy fallback.
  }
}

function markLegacyMutationForReconciliation() {
  // Production storage access is hydration-gated. Once that gate has selected
  // legacy mode — explicitly or after an IDB failure — every later mutation
  // advances the durable generation. A concurrent/future IDB context can only
  // acknowledge the generation it sampled, so it cannot hide a newer legacy
  // write. Direct pre-hydration test calls retain the byte-identical legacy
  // path established by commit 1.5.
  if (!isClearingSharedState && hydrationPromise !== null && activeEngine === "localstorage") {
    markMigrationRetry();
  }
}

function markIdbMutationDuringReconciliation() {
  // Normally IDB writes need no control-key churn: the mirror and both sinks
  // update together. If another context is currently reconciling a pending
  // generation, however, advance it after the localStorage dual-write. That
  // importer must then reject its older snapshot instead of acknowledging over
  // this newer mutation.
  if (!isClearingSharedState && readMigrationRetry().pending) markMigrationRetry();
}

function queueIdbWrite(run) {
  try {
    void Promise.resolve(run()).catch(() => markMigrationRetry());
  } catch {
    markMigrationRetry();
  }
}

function acknowledgeMigrationRetry(token) {
  if (token === null) return;
  try {
    // Never remove the request key. Another tab may write a newer token after
    // this hydration samples state; acknowledging only the sampled generation
    // leaves that newer request pending without a cross-context compare/remove
    // race.
    window.localStorage.setItem(MIGRATION_RETRY_ACK_KEY, token);
  } catch {
    // The successful IDB session remains valid even if cleanup is unavailable.
  }
}

/** The engine in force for this session ("idb" | "localstorage"). */
export function getActiveStorageEngine() {
  if (activeEngine === null) activeEngine = readEngineOverride() ?? DEFAULT_STORAGE_ENGINE;
  return activeEngine;
}

// The mirror is only authoritative once hydration has seeded it. Before that —
// and after any fallback to legacy — every read and write is plain localStorage,
// which is exactly today's behaviour. There is deliberately no buffer or replay
// into the mirror for pre-hydration accesses: main.jsx must keep every
// storage.js-owned access — including first render — behind hydrateLocalData().
// Only the R1-classified device-local flags may be touched before that gate.
function isMirrorActive() {
  return getActiveStorageEngine() === "idb" && mirror !== null;
}

async function reportEngineFallback(error) {
  try {
    const { reportError } = await import("./services/errors/reporter.js");
    reportError(error instanceof Error ? error : new Error(String(error)), "storage-engine-fallback");
  } catch {
    // Reporting must never be able to break boot.
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runHydration() {
  activeEngine = readEngineOverride() ?? DEFAULT_STORAGE_ENGINE;
  if (activeEngine !== "idb") {
    // The kill switch may stay enabled for many sessions. Mark this source as
    // authoritative now, and advance the generation again after each mutation,
    // so returning to IDB is a lossless two-way operation.
    markMigrationRetry();
    return;
  }

  try {
    // The settled Phase 5 policy bounds database opening only. Once open,
    // IndexedDB transactions complete or reject without an arbitrary
    // first-migration deadline that could false-fallback on slower WebKit.
    await withTimeout(
      openDb(),
      HYDRATION_TIMEOUT_MS,
      "IndexedDB open timed out",
    );
    const migrationRetry = readMigrationRetry();
    await migrateLocalStorageIfNeeded({ force: migrationRetry.pending });
    const entries = await kvGetAll();
    // A different context may have selected/written legacy storage while this
    // one awaited IDB. Never activate a snapshot older than the latest durable
    // generation; fall back for this session and let the next boot reconcile.
    if (readMigrationRetry().token !== migrationRetry.token) {
      throw new Error("IndexedDB hydration invalidated by a concurrent legacy write");
    }
    mirror = entries;
    // Acknowledge only after the complete import + mirror read succeeds.
    if (migrationRetry.pending) {
      acknowledgeMigrationRetry(migrationRetry.token);
    }
  } catch (error) {
    // Failure policy (R2): fall back to legacy for this session, report, and
    // ALWAYS resolve — the app must never hang on boot. Keep localStorage
    // authoritative until a later healthy boot completes an exact replay.
    markMigrationRetry();
    activeEngine = "localstorage";
    mirror = null;
    await reportEngineFallback(error);
  }
}

/**
 * Prepare synchronous local reads for this session. Resolves exactly once per
 * session (success, timeout-fallback, or failure-fallback) and never rejects.
 * In legacy mode it does no IndexedDB work and resolves immediately after
 * publishing the reconciliation generation.
 */
export function hydrateLocalData() {
  if (!hydrationPromise) hydrationPromise = runHydration();
  return hydrationPromise;
}

/**
 * Wait for fire-and-forget IndexedDB writes before deliberately leaving the
 * app document. Normal in-app reads stay synchronous through the mirror.
 */
export async function flushPendingStorageWrites() {
  if (!isMirrorActive()) return;
  await settlePendingStorageWrites();
}

async function settlePendingStorageWrites() {
  try {
    await withTimeout(flushWrites(), WRITE_FLUSH_TIMEOUT_MS, "IndexedDB write flush timed out");
  } catch {
    // Navigation/reset must remain available if a transaction stalls. The
    // synchronous dual-write is already current, and this generation forces an
    // exact localStorage → IDB replay on the next healthy boot.
    markMigrationRetry();
  }
}

const SHARED_STORAGE_KEYS = [
  STORAGE_KEY,
  SETUP_KEY,
  MOOD_KEY,
  PROFILE_KEY,
  HOME_SCREEN_VERSIONS_KEY,
  HOME_SCREEN_SELECTED_KEY,
  CARD_PACKS_KEY,
  HIDDEN_LIBRARY_PACKS_KEY,
  DISLIKED_PACK_CARD_IDS_KEY,
  GLOBAL_INTERRUPTION_MODE_KEY,
  LAUNCHER_BEHAVIOR_SETTINGS_KEY,
  ACTION_CARDS_KEY,
  ACTION_CARD_DEFAULTS_VERSION_KEY,
  NOTIFICATIONS_KEY,
  NOTIFICATION_SCHEDULE_KEY,
  APP_PAUSES_KEY,
  TIMING_WINDOWS_PREFS_KEY,
  "mybishbash.event-log.v1",
  "mybishbash.offline-event-queue.v1",
  "mybishbash.user-id.v1",
];
const LEGACY_SHARED_STORAGE_KEYS = SHARED_STORAGE_KEYS.map(getLegacyStorageKey).filter(Boolean);

async function migrateLocalStorageIfNeeded({ force = false } = {}) {
  const marker = await metaGet(MIGRATION_META_KEY);
  if (marker !== null && !force) return;

  // Read canonical keys through the existing legacy-prefix shim. A legacy-only
  // value is promoted to its canonical localStorage key and imported under that
  // canonical key; payload strings are never parsed or reshaped. This is an
  // exact reconciliation, so absent source keys delete stale partial/fallback
  // rows as well as present keys replacing them.
  for (const key of SHARED_STORAGE_KEYS) {
    const value = getLocalStorageItem(key);
    if (value !== null) await kvPut(key, value);
    else await kvDelete(key);
  }
  // Migration always canonicalises legacy-prefix localStorage values. During a
  // forced recovery, remove any legacy-prefix IDB rows too; otherwise a failed
  // clear could later fall through to one of those stale rows and resurrect it.
  if (force) {
    for (const key of LEGACY_SHARED_STORAGE_KEYS) await kvDelete(key);
  }

  // This marker is deliberately the final committed write. If boot stops
  // anywhere above, the next hydration safely replays the whole import from the
  // untouched localStorage source.
  await metaPut(MIGRATION_META_KEY, {
    at: new Date().toISOString(),
    appVersion: typeof __MYBISHBASH_VERSION__ !== "undefined" ? String(__MYBISHBASH_VERSION__) : "dev",
  });
}

export const DEFAULT_HOME_SCREEN_VERSIONS = {
  mybishbash: {
    id: "mybishbash",
    name: "myBishBash",
    installPath: rebase("/mybishbash/install/mybishbash/"),
    launchPath: "/home",
    iconSrc: rebase("/mybishbash/icons/mybishbash-cover.png"),
    realAppLabel: "",
    appUrl: "",
    manualUrl: "",
    interruptionPackId: "",
    useInterruptionPack: false,
    interruptionPaused: false,
  },
  ...Object.fromEntries(FAKE_APP_LAUNCHERS.map((launcher) => [launcher.id, launcher])),
};

export const DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS = {
  mybishbash: { useInterruptionPack: false, interruptionPaused: false, interruptionPackId: "" },
  ...Object.fromEntries(
    FAKE_APP_LAUNCHERS.map((launcher) => [
      launcher.id,
      {
        useInterruptionPack: launcher.useInterruptionPack,
        interruptionPaused: launcher.interruptionPaused,
        interruptionPackId: launcher.interruptionPackId,
      },
    ]),
  ),
};

const DEFAULT_ACTION_CARD_TIMESTAMP = "2026-05-10T00:00:00.000Z";

export const DEFAULT_ACTION_CARDS = [
  {
    id: "ac-1",
    title: "Call a family member",
    body: "A quick catch-up might feel better than scrolling right now.",
    category: "Connection",
    launchUrl: "",
    hidden: false,
    source: "starter",
    deletedAt: null,
    createdAt: DEFAULT_ACTION_CARD_TIMESTAMP,
    updatedAt: DEFAULT_ACTION_CARD_TIMESTAMP,
  },
  {
    id: "ac-2",
    title: "Do some stretching",
    body: "Reset your body for a minute before opening another app.",
    category: "Physical reset",
    launchUrl: "",
    hidden: false,
    source: "starter",
    deletedAt: null,
    createdAt: DEFAULT_ACTION_CARD_TIMESTAMP,
    updatedAt: DEFAULT_ACTION_CARD_TIMESTAMP,
  },
  {
    id: "ac-3",
    title: "Read the FT",
    body: "Swap passive scrolling for something thoughtful.",
    category: "Intentional browsing",
    launchUrl: "https://www.ft.com",
    hidden: false,
    source: "starter",
    deletedAt: null,
    createdAt: DEFAULT_ACTION_CARD_TIMESTAMP,
    updatedAt: DEFAULT_ACTION_CARD_TIMESTAMP,
  },
];

export const DEFAULT_NOTIFICATIONS = { enabled: false, notificationsPerDay: 3 };

function safeParse(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadCards() {
  const stored = safeParse(getStorageItem(STORAGE_KEY));
  if (stored && stored.length > 0) {
    return stored;
  }
  return [];
}

export function saveCards(cards) {
  setStorageItem(STORAGE_KEY, JSON.stringify(cards));
}

export function loadSetupComplete() {
  return getStorageItem(SETUP_KEY) === "true";
}

export function saveSetupComplete(value) {
  setStorageItem(SETUP_KEY, String(value));
}

export function loadMood() {
  return getStorageItem(MOOD_KEY) || "Minimal";
}

export function saveMood(value) {
  setStorageItem(MOOD_KEY, value);
}

export function loadProfile() {
  try {
    const stored = JSON.parse(getStorageItem(PROFILE_KEY) ?? "{}");
    return {
      ...stored,
      name: stored?.name ?? "",
      timezone: stored?.timezone ?? "Europe/London",
      plan: stored?.plan ?? "free",
      hasSeenCommitmentCardDemo: stored?.hasSeenCommitmentCardDemo ?? false,
      hasSkippedCommitmentCardDemo: stored?.hasSkippedCommitmentCardDemo ?? false,
      hasCompletedHomeSpotlightTour: stored?.hasCompletedHomeSpotlightTour ?? false,
    };
  } catch {
    return {
      name: "",
      timezone: "Europe/London",
      plan: "free",
      hasSeenCommitmentCardDemo: false,
      hasSkippedCommitmentCardDemo: false,
      hasCompletedHomeSpotlightTour: false,
    };
  }
}

export function saveProfile(value) {
  setStorageItem(PROFILE_KEY, JSON.stringify(value));
}

export function loadLauncherBehaviorSettings() {
  try {
    const stored = JSON.parse(getStorageItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY));
    if (stored) {
      const merged = { ...DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS };
      for (const [id, behavior] of Object.entries(stored)) {
        merged[id] = { ...merged[id], ...behavior };
      }
      return merged;
    }

    const legacyVersions = JSON.parse(getStorageItem(HOME_SCREEN_VERSIONS_KEY));
    if (legacyVersions) {
      const migrated = { ...DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS };
      for (const [id, version] of Object.entries(legacyVersions)) {
        migrated[id] = {
          ...migrated[id],
          useInterruptionPack: version.useInterruptionPack ?? DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS[id]?.useInterruptionPack ?? false,
          interruptionPaused: version.interruptionPaused ?? false,
          interruptionPackId: version.interruptionPackId ?? "",
        };
      }
      return migrated;
    }
    return DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS;
  } catch {
    return DEFAULT_LAUNCHER_BEHAVIOR_SETTINGS;
  }
}

export function saveLauncherBehaviorSettings(value) {
  setStorageItem(LAUNCHER_BEHAVIOR_SETTINGS_KEY, JSON.stringify(value));
}

export function loadHomeScreenVersions() {
  try {
    const stored = JSON.parse(getStorageItem(HOME_SCREEN_VERSIONS_KEY) ?? "{}");

    return Object.fromEntries(
      Object.entries(DEFAULT_HOME_SCREEN_VERSIONS).map(([id, defaults]) => {
        const merged = {
          ...defaults,
          ...(stored?.[id] ?? {}),
        };

        if (id === "mybishbash") {
          return [
            id,
            {
              ...merged,
              id: defaults.id,
              name: defaults.name,
              installPath: defaults.installPath,
              launchPath: defaults.launchPath,
              iconSrc: defaults.iconSrc,
              customIconSrc: "",
              realAppLabel: "",
              appUrl: "",
              manualUrl: "",
              useInterruptionPack: false,
              interruptionPaused: false,
            },
          ];
        }

        const registryLauncher = LAUNCHER_REGISTRY[id] ?? defaults;
        const launcherConfig = mergeLauncherConfig(registryLauncher, merged) ?? registryLauncher;

        return [
          id,
          {
            ...merged,
            id: defaults.id,
            name: launcherConfig.displayName ?? launcherConfig.name ?? defaults.name,
            displayName: launcherConfig.displayName ?? launcherConfig.name ?? defaults.displayName ?? defaults.name,
            category: launcherConfig.category ?? defaults.category,
            installPath: launcherConfig.installPath ?? defaults.installPath,
            launchPath: launcherConfig.launchPath ?? defaults.launchPath,
            manifestPath: launcherConfig.manifestPath ?? defaults.manifestPath,
            iconSrc: launcherConfig.iconSrc ?? defaults.iconSrc,
            customIconSrc: launcherConfig.customIconSrc ?? merged.customIconSrc ?? "",
            realAppLabel: launcherConfig.realAppLabel ?? defaults.realAppLabel,
            appUrl: launcherConfig.appUrl ?? defaults.appUrl,
            iosAppUrl: launcherConfig.iosAppUrl ?? defaults.iosAppUrl,
            androidIntentUrl: launcherConfig.androidIntentUrl ?? defaults.androidIntentUrl,
            androidWebFallbackUrl: launcherConfig.androidWebFallbackUrl ?? defaults.androidWebFallbackUrl,
            iosWebFallbackUrl: launcherConfig.iosWebFallbackUrl ?? defaults.iosWebFallbackUrl,
            manualUrl: launcherConfig.manualUrl ?? defaults.manualUrl,
            nativeAppUrl: launcherConfig.nativeAppUrl ?? defaults.nativeAppUrl,
            webFallbackUrl: launcherConfig.webFallbackUrl ?? defaults.webFallbackUrl,
            availabilityStatus: launcherConfig.availabilityStatus ?? defaults.availabilityStatus,
            enabled: launcherConfig.enabled ?? defaults.enabled ?? true,
            hqVisible: launcherConfig.hqVisible ?? defaults.hqVisible ?? true,
            useInterruptionPack:
              typeof merged.useInterruptionPack === "boolean"
                ? merged.useInterruptionPack
                : defaults.useInterruptionPack,
            interruptionPaused: Boolean(merged.interruptionPaused),
          },
        ];
      }),
    );
  } catch {
    return DEFAULT_HOME_SCREEN_VERSIONS;
  }
}

export function saveHomeScreenVersions(value) {
  setStorageItem(HOME_SCREEN_VERSIONS_KEY, JSON.stringify(value));
}

export function loadSelectedHomeScreenVersion() {
  const selected = getStorageItem(HOME_SCREEN_SELECTED_KEY);
  return selected && DEFAULT_HOME_SCREEN_VERSIONS[selected] ? selected : "mybishbash";
}

export function saveSelectedHomeScreenVersion(value) {
  setStorageItem(HOME_SCREEN_SELECTED_KEY, value);
}

export function loadCardPacks() {
  try {
    const stored = JSON.parse(getStorageItem(CARD_PACKS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveCardPacks(value) {
  setStorageItem(CARD_PACKS_KEY, JSON.stringify(value));
}

export function loadHiddenLibraryPacks() {
  try {
    const stored = JSON.parse(getStorageItem(HIDDEN_LIBRARY_PACKS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveHiddenLibraryPacks(value) {
  setStorageItem(HIDDEN_LIBRARY_PACKS_KEY, JSON.stringify(value));
}

export function loadDislikedPackCardIds() {
  try {
    const stored = JSON.parse(getStorageItem(DISLIKED_PACK_CARD_IDS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveDislikedPackCardIds(value) {
  setStorageItem(DISLIKED_PACK_CARD_IDS_KEY, JSON.stringify(value));
}

export function loadGlobalInterruptionMode() {
  const stored = getStorageItem(GLOBAL_INTERRUPTION_MODE_KEY);
  return stored == null ? true : stored === "true";
}

export function saveGlobalInterruptionMode(value) {
  setStorageItem(GLOBAL_INTERRUPTION_MODE_KEY, String(value));
}

export function loadActionCards() {
  try {
    const stored = JSON.parse(getStorageItem(ACTION_CARDS_KEY));
    const storedArray = Array.isArray(stored) ? stored : [];
    const defaultsVersion = getStorageItem(ACTION_CARD_DEFAULTS_VERSION_KEY);
    const map = new Map();
    DEFAULT_ACTION_CARDS.forEach((card) => map.set(card.id, { ...card, defaultsVersion: ACTION_CARD_DEFAULTS_VERSION }));

    storedArray.forEach((card) => {
      if (card?.id) {
        const defaultCard = map.get(card.id);
        if (card.source === "starter" && defaultCard) {
          const userChangedStarter =
            card.deletedAt ||
            card.hidden ||
            (card.updatedAt && card.updatedAt !== DEFAULT_ACTION_CARD_TIMESTAMP);

          map.set(card.id, {
            ...(userChangedStarter || defaultsVersion === ACTION_CARD_DEFAULTS_VERSION ? card : defaultCard),
            hidden: Boolean(card.hidden),
            deletedAt: card.deletedAt ?? null,
            defaultsVersion: ACTION_CARD_DEFAULTS_VERSION,
          });
          return;
        }

        map.set(card.id, { ...card });
      }
    });
    setStorageItem(ACTION_CARD_DEFAULTS_VERSION_KEY, ACTION_CARD_DEFAULTS_VERSION);
    return Array.from(map.values());
  } catch {
    setStorageItem(ACTION_CARD_DEFAULTS_VERSION_KEY, ACTION_CARD_DEFAULTS_VERSION);
    return DEFAULT_ACTION_CARDS;
  }
}

export function saveActionCards(value) {
  setStorageItem(ACTION_CARDS_KEY, JSON.stringify(value));
}

export function loadNotificationSettings() {
  try {
    const stored = JSON.parse(getStorageItem(NOTIFICATIONS_KEY));
    return stored ? { ...DEFAULT_NOTIFICATIONS, ...stored } : DEFAULT_NOTIFICATIONS;
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export function saveNotificationSettings(value) {
  setStorageItem(NOTIFICATIONS_KEY, JSON.stringify(value));
}

export function loadNotificationSchedule() {
  try {
    const stored = JSON.parse(getStorageItem(NOTIFICATION_SCHEDULE_KEY));
    return stored || { date: "", targets: [], sentCount: 0, lastSentAt: null };
  } catch {
    return { date: "", targets: [], sentCount: 0, lastSentAt: null };
  }
}

export function saveNotificationSchedule(value) {
  setStorageItem(NOTIFICATION_SCHEDULE_KEY, JSON.stringify(value));
}

// ─── Timing-window preferences ──────────────────────────────────────────────
// Stores the user's custom hour boundaries for morning/day/evening/night.
// Returns null if nothing is stored or the stored value is invalid — the caller
// should fall back to DEFAULT_WINDOW_DEFS from utils.js in that case.

export function loadTimingWindowsPrefs() {
  try {
    const stored = JSON.parse(getStorageItem(TIMING_WINDOWS_PREFS_KEY));
    if (
      Array.isArray(stored) &&
      stored.length === 4 &&
      stored.every(
        (d) =>
          d &&
          typeof d.id === "string" &&
          typeof d.start === "number" &&
          typeof d.end === "number" &&
          d.start >= 0 && d.start <= 23 &&
          d.end >= 0 && d.end <= 23 &&
          d.start !== d.end,
      )
    ) {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTimingWindowsPrefs(value) {
  setStorageItem(TIMING_WINDOWS_PREFS_KEY, JSON.stringify(value));
}

// ─── App-specific pause storage ─────────────────────────────────────────────
// Stores per-app pause expiry timestamps under APP_PAUSES_KEY.
// Format: { "instagram": "2026-06-08T21:00:00.000Z", ... }

function getAppPausesMap() {
  try {
    const stored = JSON.parse(getStorageItem(APP_PAUSES_KEY) ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveAppPausesMap(map) {
  setStorageItem(APP_PAUSES_KEY, JSON.stringify(map));
}

export function getAppPauseExpiry(appId) {
  if (!appId) return null;
  return getAppPausesMap()[appId] ?? null;
}

export function isAppPaused(appId) {
  if (!appId) return false;
  const expiry = getAppPauseExpiry(appId);
  if (!expiry) return false;
  return new Date(expiry).getTime() > Date.now();
}

export function pauseApp(appId, durationMinutes) {
  if (!appId || !(durationMinutes > 0)) return null;
  const expiry = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const map = getAppPausesMap();
  map[appId] = expiry;
  saveAppPausesMap(map);
  return expiry;
}

export function clearAppPause(appId) {
  if (!appId) return;
  const map = getAppPausesMap();
  if (map[appId] !== undefined) {
    delete map[appId];
    saveAppPausesMap(map);
  }
}

export function clearExpiredAppPause(appId) {
  if (!appId || isAppPaused(appId)) return;
  const map = getAppPausesMap();
  if (map[appId] !== undefined) {
    delete map[appId];
    saveAppPausesMap(map);
  }
}

export function clearSharedMyBishBashState() {
  const keys = [...SHARED_STORAGE_KEYS, ...LEGACY_SHARED_STORAGE_KEYS];
  const mirrorWasActive = isMirrorActive();

  // Preserve the established localStorage removal order, but publish one
  // durable invalidation for the atomic clear instead of forty intermediate
  // generations.
  isClearingSharedState = true;
  try {
    keys.forEach((key) => removeStorageItem(key));
  } finally {
    isClearingSharedState = false;
  }
  if (hydrationPromise !== null) markMigrationRetry();

  // In IDB mode removeStorageItem already enqueued every delete. Under the
  // explicit kill switch or automatic fallback there is no mirror, so clear
  // the IDB sink directly as well. Failure is recoverable: the generation
  // above makes the next healthy IDB boot reconcile from the now-empty source.
  if (!mirrorWasActive) keys.forEach((key) => void kvDelete(key));

  // Synchronous callers still observe the cleared mirror/localStorage
  // immediately; account/reset flows may await durable IDB settlement.
  return settlePendingStorageWrites();
}
