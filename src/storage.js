import { FAKE_APP_LAUNCHERS, LAUNCHER_REGISTRY, mergeLauncherConfig } from "./lib/launcherRegistry";

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

function getStorageItem(key) {
  const value = window.localStorage.getItem(key);
  if (value !== null) return value;

  const legacyKey = getLegacyStorageKey(key);
  if (!legacyKey) return null;

  const legacyValue = window.localStorage.getItem(legacyKey);
  if (legacyValue !== null) {
    window.localStorage.setItem(key, legacyValue);
  }
  return legacyValue;
}

function setStorageItem(key, value) {
  window.localStorage.setItem(key, value);
}


const SHARED_STORAGE_KEYS = [
  STORAGE_KEY,
  SETUP_KEY,
  MOOD_KEY,
  PROFILE_KEY,
  CARD_PACKS_KEY,
  HIDDEN_LIBRARY_PACKS_KEY,
  DISLIKED_PACK_CARD_IDS_KEY,
  GLOBAL_INTERRUPTION_MODE_KEY,
  LAUNCHER_BEHAVIOR_SETTINGS_KEY,
  ACTION_CARDS_KEY,
  NOTIFICATIONS_KEY,
  APP_PAUSES_KEY,
  "mybishbash.event-log.v1",
  "mybishbash.offline-event-queue.v1",
  "mybishbash.user-id.v1",
];
const LEGACY_SHARED_STORAGE_KEYS = SHARED_STORAGE_KEYS.map(getLegacyStorageKey).filter(Boolean);

export const DEFAULT_HOME_SCREEN_VERSIONS = {
  mybishbash: {
    id: "mybishbash",
    name: "MyBishBash",
    installPath: "/mybishbash/install/mybishbash/",
    launchPath: "/home",
    iconSrc: "/mybishbash/icons/mybishbash-cover.png",
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
    };
  } catch {
    return {
      name: "",
      timezone: "Europe/London",
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
    const stored = JSON.parse(window.localStorage.getItem(APP_PAUSES_KEY) ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveAppPausesMap(map) {
  window.localStorage.setItem(APP_PAUSES_KEY, JSON.stringify(map));
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

export function clearExpiredAppPause(appId) {
  if (!appId || isAppPaused(appId)) return;
  const map = getAppPausesMap();
  if (map[appId] !== undefined) {
    delete map[appId];
    saveAppPausesMap(map);
  }
}

export function clearSharedMyBishBashState() {
  [...SHARED_STORAGE_KEYS, ...LEGACY_SHARED_STORAGE_KEYS].forEach((key) => window.localStorage.removeItem(key));
}
