const STORAGE_KEY = "bishbash.cards.v1";
const SETUP_KEY = "bishbash.setup-complete.v1";
const MOOD_KEY = "bishbash.mood.v1";
const PROFILE_KEY = "bishbash.profile.v1";
const HOME_SCREEN_VERSIONS_KEY = "bishbash.home-screen-versions.v1";
const HOME_SCREEN_SELECTED_KEY = "bishbash.home-screen-selected.v1";
const CARD_PACKS_KEY = "bishbash.card-packs.v1";
const HIDDEN_LIBRARY_PACKS_KEY = "bishbash.hidden-library-packs.v1";
const DISLIKED_PACK_CARD_IDS_KEY = "bishbash.disliked-pack-card-ids.v1";
const GLOBAL_INTERRUPTION_MODE_KEY = "bishbash.global-interruption-mode.v1";

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
  "bishbash.event-log.v1",
  "bishbash.user-id.v1",
];

export const DEFAULT_HOME_SCREEN_VERSIONS = {
  bishbash: {
    id: "bishbash",
    name: "BishBash",
    installPath: "/bishbash/install/bishbash/",
    launchPath: "/home",
    iconSrc: "/bishbash/icons/bishbash-cover.png",
    realAppLabel: "",
    appUrl: "",
    manualUrl: "",
    interruptionPackId: "",
    useInterruptionPack: false,
    interruptionPaused: false,
  },
  safari: {
    id: "safari",
    name: "Safari",
    installPath: "/bishbash/install/safari/",
    launchPath: "/intercept/safari",
    iconSrc: "/bishbash/icons/apple-touch-icon.png",
    realAppLabel: "Safari",
    appUrl: "",
    manualUrl: "x-safari-https://www.google.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    installPath: "/bishbash/install/youtube/",
    launchPath: "/intercept/youtube",
    iconSrc: "/bishbash/icons/youtube-cover.png",
    realAppLabel: "YouTube",
    appUrl: "youtube://",
    manualUrl: "https://www.youtube.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    installPath: "/bishbash/install/instagram/",
    launchPath: "/intercept/instagram",
    iconSrc: "/bishbash/icons/instagram-cover.jpg",
    realAppLabel: "Instagram",
    appUrl: "instagram://app",
    manualUrl: "https://www.instagram.com",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
  },
};

function safeParse(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadCards() {
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (stored && stored.length > 0) {
    return stored;
  }
  return [];
}

export function saveCards(cards) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function loadSetupComplete() {
  return window.localStorage.getItem(SETUP_KEY) === "true";
}

export function saveSetupComplete(value) {
  window.localStorage.setItem(SETUP_KEY, String(value));
}

export function loadMood() {
  return window.localStorage.getItem(MOOD_KEY) || "Minimal";
}

export function saveMood(value) {
  window.localStorage.setItem(MOOD_KEY, value);
}

export function loadProfile() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "{}");
    return {
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
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
}

export function loadHomeScreenVersions() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(HOME_SCREEN_VERSIONS_KEY) ?? "{}");

    return Object.fromEntries(
      Object.entries(DEFAULT_HOME_SCREEN_VERSIONS).map(([id, defaults]) => {
        const merged = {
          ...defaults,
          ...(stored?.[id] ?? {}),
        };

        if (id === "bishbash") {
          return [
            id,
            {
              ...merged,
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

        if (id === "safari") {
          return [
            id,
            {
              ...merged,
              appUrl: "",
              manualUrl: "x-safari-https://www.google.com",
              useInterruptionPack:
                typeof merged.useInterruptionPack === "boolean" ? merged.useInterruptionPack : defaults.useInterruptionPack,
              interruptionPaused: Boolean(merged.interruptionPaused),
            },
          ];
        }

        return [
          id,
          {
            ...merged,
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
  window.localStorage.setItem(HOME_SCREEN_VERSIONS_KEY, JSON.stringify(value));
}

export function loadSelectedHomeScreenVersion() {
  const selected = window.localStorage.getItem(HOME_SCREEN_SELECTED_KEY);
  return selected && DEFAULT_HOME_SCREEN_VERSIONS[selected] ? selected : "bishbash";
}

export function saveSelectedHomeScreenVersion(value) {
  window.localStorage.setItem(HOME_SCREEN_SELECTED_KEY, value);
}

export function loadCardPacks() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CARD_PACKS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveCardPacks(value) {
  window.localStorage.setItem(CARD_PACKS_KEY, JSON.stringify(value));
}

export function loadHiddenLibraryPacks() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(HIDDEN_LIBRARY_PACKS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveHiddenLibraryPacks(value) {
  window.localStorage.setItem(HIDDEN_LIBRARY_PACKS_KEY, JSON.stringify(value));
}

export function loadDislikedPackCardIds() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DISLIKED_PACK_CARD_IDS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveDislikedPackCardIds(value) {
  window.localStorage.setItem(DISLIKED_PACK_CARD_IDS_KEY, JSON.stringify(value));
}

export function loadGlobalInterruptionMode() {
  const stored = window.localStorage.getItem(GLOBAL_INTERRUPTION_MODE_KEY);
  return stored == null ? true : stored === "true";
}

export function saveGlobalInterruptionMode(value) {
  window.localStorage.setItem(GLOBAL_INTERRUPTION_MODE_KEY, String(value));
}

export function clearSharedBishBashState() {
  SHARED_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}
