import {
  LAUNCHER_AVAILABILITY,
  deriveAvailabilityFromLegacyFlags,
  isAvailabilityStatusEnabledForUsers,
  isValidAvailabilityStatus,
} from "./launcherAvailability.js";

const LAUNCHER_TIMESTAMP = "2026-05-13T00:00:00.000Z";
export const PLACEHOLDER_ICON_SRC = "/mybishbash/icons/mybishbash-cover.png";

export const LAUNCHER_THEME = {
  backgroundColor: "#F7F2EE",
  themeColor: "#F7F2EE",
};

export const FAKE_APP_LAUNCHERS = [
  {
    id: "safari",
    displayName: "Safari",
    name: "Safari",
    realAppLabel: "Safari",
    category: "browser",
    installPath: "/mybishbash/install/safari/",
    launchPath: "/intercept/safari",
    manifestPath: "/mybishbash/launchers/safari/manifest.webmanifest",
    iconSrc: "/mybishbash/icons/apple-touch-icon.png",
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://www.google.com",
    appUrl: "",
    androidIntentUrl: "",
    androidWebFallbackUrl: "https://www.google.com",
    iosAppUrl: "x-safari-https://www.google.com",
    iosWebFallbackUrl: "https://www.google.com",
    manualUrl: "x-safari-https://www.google.com",
    defaultInterruptionPackId: "safari-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "public",
    qaNotes: "",
    enabled: true,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "youtube",
    displayName: "YouTube",
    name: "YouTube",
    realAppLabel: "YouTube",
    category: "video",
    installPath: "/mybishbash/install/youtube/",
    launchPath: "/intercept/youtube",
    manifestPath: "/mybishbash/launchers/youtube/manifest.webmanifest",
    iconSrc: "/mybishbash/icons/youtube-cover.png",
    customIconSrc: "",
    nativeAppUrl: "youtube://",
    webFallbackUrl: "https://www.youtube.com",
    appUrl: "youtube://",
    androidIntentUrl: "intent://www.youtube.com/#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com;end",
    androidWebFallbackUrl: "https://www.youtube.com",
    iosAppUrl: "youtube://",
    iosWebFallbackUrl: "https://www.youtube.com",
    manualUrl: "https://www.youtube.com",
    defaultInterruptionPackId: "youtube-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "public",
    qaNotes: "",
    enabled: true,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "instagram",
    displayName: "Instagram",
    name: "Instagram",
    realAppLabel: "Instagram",
    category: "social",
    installPath: "/mybishbash/install/instagram/",
    launchPath: "/intercept/instagram",
    manifestPath: "/mybishbash/launchers/instagram/manifest.webmanifest",
    iconSrc: "/mybishbash/icons/instagram-cover.jpg",
    customIconSrc: "",
    nativeAppUrl: "instagram://app",
    webFallbackUrl: "https://www.instagram.com",
    appUrl: "instagram://app",
    androidIntentUrl: "intent://instagram.com/#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com;end",
    androidWebFallbackUrl: "https://www.instagram.com",
    iosAppUrl: "instagram://app",
    iosWebFallbackUrl: "https://www.instagram.com",
    manualUrl: "https://www.instagram.com",
    defaultInterruptionPackId: "instagram-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "public",
    qaNotes: "",
    enabled: true,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "chrome",
    displayName: "Chrome",
    name: "Chrome",
    realAppLabel: "Chrome",
    category: "browser",
    installPath: "/mybishbash/install/chrome/",
    launchPath: "/intercept/chrome",
    manifestPath: "/mybishbash/launchers/chrome/manifest.webmanifest",
    iconSrc: "/mybishbash/icons/chrome-cover.png",
    customIconSrc: "",
    nativeAppUrl: "googlechromes://www.google.com",
    webFallbackUrl: "https://www.google.com",
    appUrl: "googlechromes://www.google.com",
    androidIntentUrl: "intent://www.google.com/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.google.com;end",
    androidWebFallbackUrl: "https://www.google.com",
    iosAppUrl: "googlechromes://www.google.com",
    iosWebFallbackUrl: "https://www.google.com",
    manualUrl: "https://www.google.com",
    defaultInterruptionPackId: "chrome-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "reddit",
    displayName: "Reddit",
    name: "Reddit",
    realAppLabel: "Reddit",
    category: "social",
    installPath: "/mybishbash/install/reddit/",
    launchPath: "/intercept/reddit",
    manifestPath: "/mybishbash/launchers/reddit/manifest.webmanifest",
    iconSrc: PLACEHOLDER_ICON_SRC,
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://www.reddit.com",
    appUrl: "",
    androidIntentUrl: "intent://www.reddit.com/#Intent;scheme=https;package=com.reddit.frontpage;S.browser_fallback_url=https%3A%2F%2Fwww.reddit.com;end",
    androidWebFallbackUrl: "https://www.reddit.com",
    iosAppUrl: "https://www.reddit.com",
    iosWebFallbackUrl: "https://www.reddit.com",
    manualUrl: "https://www.reddit.com",
    defaultInterruptionPackId: "reddit-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "linkedin",
    displayName: "LinkedIn",
    name: "LinkedIn",
    realAppLabel: "LinkedIn",
    category: "professional",
    installPath: "/mybishbash/install/linkedin/",
    launchPath: "/intercept/linkedin",
    manifestPath: "/mybishbash/launchers/linkedin/manifest.webmanifest",
    iconSrc: PLACEHOLDER_ICON_SRC,
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://www.linkedin.com/feed/",
    appUrl: "",
    androidIntentUrl: "intent://www.linkedin.com/feed/#Intent;scheme=https;package=com.linkedin.android;S.browser_fallback_url=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2F;end",
    androidWebFallbackUrl: "https://www.linkedin.com/feed/",
    iosAppUrl: "https://www.linkedin.com/feed/",
    iosWebFallbackUrl: "https://www.linkedin.com/feed/",
    manualUrl: "https://www.linkedin.com/feed/",
    defaultInterruptionPackId: "linkedin-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "whatsapp",
    displayName: "WhatsApp",
    name: "WhatsApp",
    realAppLabel: "WhatsApp",
    category: "messaging",
    installPath: "/mybishbash/install/whatsapp/",
    launchPath: "/intercept/whatsapp",
    manifestPath: "/mybishbash/launchers/whatsapp/manifest.webmanifest",
    iconSrc: "/mybishbash/icons/whatsapp-cover.jpeg",
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://api.whatsapp.com/send",
    appUrl: "",
    // Needs manual iPhone PWA QA before enabling; whatsapp:// has no safe app-not-installed fallback here.
    androidIntentUrl: "intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fapi.whatsapp.com%2Fsend;end",
    androidWebFallbackUrl: "https://api.whatsapp.com/send",
    iosAppUrl: "https://api.whatsapp.com/send",
    iosWebFallbackUrl: "https://api.whatsapp.com/send",
    manualUrl: "https://api.whatsapp.com/send",
    qaDestinationCandidates: {
      preferred: "https://api.whatsapp.com/send",
      ios: ["https://api.whatsapp.com/send", "https://wa.me/", "whatsapp://", "https://web.whatsapp.com/"],
      android: [
        "intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fapi.whatsapp.com%2Fsend;end",
        "https://api.whatsapp.com/send",
        "https://wa.me/",
        "https://web.whatsapp.com/",
      ],
      fallback: "https://api.whatsapp.com/send",
      notes: "Manual QA only while disabled; web.whatsapp.com is weak on iPhone and whatsapp:// cannot fall back if the app is missing.",
    },
    defaultInterruptionPackId: "whatsapp-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "bbc-news",
    displayName: "BBC News",
    name: "BBC News",
    realAppLabel: "BBC News",
    category: "news",
    installPath: "/mybishbash/install/bbc-news/",
    launchPath: "/intercept/bbc-news",
    manifestPath: "/mybishbash/launchers/bbc-news/manifest.webmanifest",
    iconSrc: PLACEHOLDER_ICON_SRC,
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://www.bbc.co.uk/news",
    appUrl: "",
    androidIntentUrl: "intent://www.bbc.co.uk/news#Intent;scheme=https;package=bbc.mobile.news.ww;S.browser_fallback_url=https%3A%2F%2Fwww.bbc.co.uk%2Fnews;end",
    androidWebFallbackUrl: "https://www.bbc.co.uk/news",
    iosAppUrl: "https://www.bbc.co.uk/news",
    iosWebFallbackUrl: "https://www.bbc.co.uk/news",
    manualUrl: "https://www.bbc.co.uk/news",
    defaultInterruptionPackId: "bbc-news-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
  {
    id: "duolingo",
    displayName: "Duolingo",
    name: "Duolingo",
    realAppLabel: "Duolingo",
    category: "learning",
    installPath: "/mybishbash/install/duolingo/",
    launchPath: "/intercept/duolingo",
    manifestPath: "/mybishbash/launchers/duolingo/manifest.webmanifest",
    iconSrc: PLACEHOLDER_ICON_SRC,
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://www.duolingo.com/learn",
    appUrl: "",
    androidIntentUrl: "intent://www.duolingo.com/learn#Intent;scheme=https;package=com.duolingo;S.browser_fallback_url=https%3A%2F%2Fwww.duolingo.com%2Flearn;end",
    androidWebFallbackUrl: "https://www.duolingo.com/learn",
    iosAppUrl: "https://www.duolingo.com/learn",
    iosWebFallbackUrl: "https://www.duolingo.com/learn",
    manualUrl: "https://www.duolingo.com/learn",
    defaultInterruptionPackId: "duolingo-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
    availabilityStatus: "hidden",
    qaNotes: "",
    enabled: false,
    hqVisible: true,
    createdAt: LAUNCHER_TIMESTAMP,
    updatedAt: LAUNCHER_TIMESTAMP,
  },
];

export const LAUNCHER_IDS = FAKE_APP_LAUNCHERS.map((launcher) => launcher.id);
export const LAUNCHER_REGISTRY = Object.fromEntries(
  FAKE_APP_LAUNCHERS.map((launcher) => [launcher.id, launcher]),
);

const HQ_EDITABLE_FIELDS = [
  "displayName",
  "name",
  "realAppLabel",
  "iconSrc",
  "customIconSrc",
  "nativeAppUrl",
  "appUrl",
  "iosAppUrl",
  "androidIntentUrl",
  "webFallbackUrl",
  "androidWebFallbackUrl",
  "iosWebFallbackUrl",
  "manualUrl",
  "availabilityStatus",
  "qaNotes",
  "enabled",
  "hqVisible",
  "useInterruptionPack",
  "interruptionPackId",
];

// Icon values may be root-relative paths (static assets), https URLs
// (HQ-provided/uploaded), or data URLs for common safe image types.
export function sanitizeLauncherIconSrc(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^\/[^\s]+$/.test(trimmed)) return trimmed;
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|webp|svg\+xml|gif);/i.test(trimmed)) return trimmed;
  return "";
}

// HQ is the source of truth for each app's visual identity. Resolution order:
// 1. HQ-uploaded/custom image  2. default static icon  3. safe placeholder.
export function resolveLauncherIconSrc(launcher = {}) {
  return (
    sanitizeLauncherIconSrc(launcher.customIconSrc) ||
    sanitizeLauncherIconSrc(launcher.iconSrc) ||
    PLACEHOLDER_ICON_SRC
  );
}

export function sanitizeLauncherUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|x-safari-|instagram:\/\/|youtube:\/\/|googlechromes?:\/\/|intent:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

export function normalizeLauncherOverride(override = {}) {
  const normalized = {};
  HQ_EDITABLE_FIELDS.forEach((field) => {
    if (!(field in override)) return;
    const value = override[field];
    if (value == null) return;
    if (typeof value === "string" && value.trim() === "") return;
    if (field.endsWith("Url")) {
      const safeUrl = sanitizeLauncherUrl(value);
      if (safeUrl) normalized[field] = safeUrl;
      return;
    }
    if (field === "iconSrc" || field === "customIconSrc") {
      const safeIcon = sanitizeLauncherIconSrc(value);
      if (safeIcon) normalized[field] = safeIcon;
      return;
    }
    if (["enabled", "hqVisible", "useInterruptionPack"].includes(field)) {
      if (typeof value !== "boolean") return;
      normalized[field] = Boolean(value);
      return;
    }
    if (field === "availabilityStatus") {
      if (isValidAvailabilityStatus(value)) normalized[field] = value;
      return;
    }
    normalized[field] = typeof value === "string" ? value.trim() : value;
  });
  return normalized;
}

export function mergeLauncherConfig(defaultLauncher, override = {}) {
  if (!defaultLauncher) return null;
  const normalized = normalizeLauncherOverride(override);
  const merged = {
    ...defaultLauncher,
    ...normalized,
    id: defaultLauncher.id,
    category: defaultLauncher.category,
    installPath: defaultLauncher.installPath,
    launchPath: defaultLauncher.launchPath,
    manifestPath: defaultLauncher.manifestPath,
    defaultInterruptionPackId: defaultLauncher.defaultInterruptionPackId,
  };
  // Reconcile availability with the legacy enabled flag so the two can
  // never contradict each other. An explicit status wins; otherwise a legacy
  // enabled override maps onto a status.
  let availabilityStatus = merged.availabilityStatus;
  if (!isValidAvailabilityStatus(availabilityStatus)) availabilityStatus = undefined;
  if (normalized.availabilityStatus == null && typeof normalized.enabled === "boolean") {
    availabilityStatus = deriveAvailabilityFromLegacyFlags({
      enabled: normalized.enabled,
      hqVisible: merged.hqVisible,
    });
  }
  if (!availabilityStatus) {
    availabilityStatus = deriveAvailabilityFromLegacyFlags(merged);
  }

  return {
    ...merged,
    availabilityStatus,
    enabled: isAvailabilityStatusEnabledForUsers(availabilityStatus),
    name: merged.name || merged.displayName || defaultLauncher.name,
    displayName: merged.displayName || merged.name || defaultLauncher.displayName,
    realAppLabel: merged.realAppLabel ?? defaultLauncher.realAppLabel,
    updatedAt: override.updatedAt ?? override.updated_at ?? defaultLauncher.updatedAt,
  };
}

// ── HQ-created (custom) launchers ───────────────────────────────────────────
//
// HQ can create, test and deploy new protected-app records without a code
// release. Custom rows (is_custom=true) become first-class launcher
// definitions through the runtime registry below: routes, the fake launcher
// bar, settings and onboarding all consult isKnownLauncher/getLauncherConfig,
// which see both static and registered dynamic launchers. Going live is
// gated by strict validation rather than a code release. The one static-host
// limitation: per-app PWA home-screen manifests/install pages are build-time
// files, so installable home-screen shortcuts still need the app promoted
// into FAKE_APP_LAUNCHERS in a release (requiresRelease flags this).

export const LAUNCHER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const RESERVED_LAUNCHER_IDS = [
  "mybishbash",
  "intercept",
  "install",
  "launchers",
  "settings",
  "home",
  "hq",
  "library",
  "log",
  "packs",
];

// Statuses that expose a launcher beyond HQ. Moving a custom app into one of
// these requires the stricter go-live validation below.
export const USER_FACING_AVAILABILITY_STATUSES = [
  LAUNCHER_AVAILABILITY.PUBLIC,
  LAUNCHER_AVAILABILITY.TESTER_ONLY,
  LAUNCHER_AVAILABILITY.EXPERIMENTAL,
];

export function isUserFacingAvailabilityStatus(status) {
  return USER_FACING_AVAILABILITY_STATUSES.includes(status);
}

export function validateLauncherDraft(draft = {}, { existingIds = [], targetStatus = null } = {}) {
  const errors = [];
  const id = String(draft.id ?? "").trim();

  if (!id) {
    errors.push("App ID is required.");
  } else if (!LAUNCHER_ID_PATTERN.test(id)) {
    errors.push("App ID must be a URL-safe slug: lowercase letters, numbers and hyphens (max 40 chars).");
  } else if (RESERVED_LAUNCHER_IDS.includes(id)) {
    errors.push(`"${id}" is a reserved route name and cannot be an app ID.`);
  }

  const allKnownIds = new Set([...LAUNCHER_IDS, ...existingIds]);
  if (id && allKnownIds.has(id)) {
    errors.push(`An app with ID "${id}" already exists.`);
  }

  if (!String(draft.displayName ?? "").trim()) {
    errors.push("Display name is required.");
  }

  const destinationFields = [
    "webFallbackUrl",
    "iosWebFallbackUrl",
    "androidWebFallbackUrl",
    "manualUrl",
    "iosAppUrl",
    "androidIntentUrl",
  ];
  const hasDestination = destinationFields.some((field) => sanitizeLauncherUrl(draft[field]));
  if (!hasDestination) {
    errors.push("At least one valid destination URL is required (https://, intent:// or a supported app scheme).");
  }
  for (const field of destinationFields) {
    const raw = String(draft[field] ?? "").trim();
    if (raw && !sanitizeLauncherUrl(raw)) {
      errors.push(`${field} is not a safe destination URL.`);
    }
  }

  const rawIcon = String(draft.customIconSrc ?? "").trim();
  if (rawIcon && !sanitizeLauncherIconSrc(rawIcon)) {
    errors.push("Custom icon must be an https URL, a site-relative path, or an uploaded image.");
  }

  // Go-live gate: before a launcher can be exposed to testers or users it
  // must have a browser-safe web fallback, so "Continue to app" can never
  // silently dead-end when the native app/scheme is unavailable.
  if (isUserFacingAvailabilityStatus(targetStatus)) {
    const webFallback = [draft.webFallbackUrl, draft.iosWebFallbackUrl, draft.androidWebFallbackUrl, draft.manualUrl]
      .map((value) => sanitizeLauncherUrl(value))
      .find((value) => /^https:\/\//i.test(value));
    if (!webFallback) {
      errors.push("A valid https web fallback URL is required before this app can be visible to testers or users.");
    }
  }

  return { ok: errors.length === 0, errors };
}

// Shape a stored custom config row into a full launcher object. Paths are
// generated from the slug; routes work immediately through the runtime
// registry, while requiresRelease marks that per-app PWA install assets
// (manifest + install page) only exist after promotion into the static
// registry. Invalid statuses fall back to draft.
export function buildCustomLauncher(config = {}) {
  const id = String(config.id ?? "").trim();
  if (!LAUNCHER_ID_PATTERN.test(id) || RESERVED_LAUNCHER_IDS.includes(id) || LAUNCHER_REGISTRY[id]) {
    return null;
  }
  const availabilityStatus = isValidAvailabilityStatus(config.availabilityStatus)
    ? config.availabilityStatus
    : LAUNCHER_AVAILABILITY.DRAFT;
  const displayName = String(config.displayName ?? config.name ?? "").trim() || id;
  return {
    id,
    displayName,
    name: displayName,
    realAppLabel: String(config.realAppLabel ?? "").trim() || displayName,
    category: String(config.category ?? "").trim() || "other",
    installPath: `/mybishbash/install/${id}/`,
    launchPath: `/intercept/${id}`,
    manifestPath: `/mybishbash/launchers/${id}/manifest.webmanifest`,
    iconSrc: sanitizeLauncherIconSrc(config.iconSrc) || PLACEHOLDER_ICON_SRC,
    customIconSrc: sanitizeLauncherIconSrc(config.customIconSrc) || "",
    nativeAppUrl: sanitizeLauncherUrl(config.nativeAppUrl),
    webFallbackUrl: sanitizeLauncherUrl(config.webFallbackUrl),
    appUrl: sanitizeLauncherUrl(config.appUrl),
    androidIntentUrl: sanitizeLauncherUrl(config.androidIntentUrl),
    androidWebFallbackUrl: sanitizeLauncherUrl(config.androidWebFallbackUrl),
    iosAppUrl: sanitizeLauncherUrl(config.iosAppUrl),
    iosWebFallbackUrl: sanitizeLauncherUrl(config.iosWebFallbackUrl),
    manualUrl: sanitizeLauncherUrl(config.manualUrl),
    defaultInterruptionPackId: `${id}-interruption`,
    interruptionPackId: String(config.interruptionPackId ?? "").trim(),
    useInterruptionPack: config.useInterruptionPack !== false,
    interruptionPaused: false,
    availabilityStatus,
    qaNotes: String(config.qaNotes ?? "").trim(),
    enabled: isAvailabilityStatusEnabledForUsers(availabilityStatus),
    hqVisible: config.hqVisible !== false,
    isCustom: true,
    requiresRelease: true,
    createdAt: config.createdAt ?? null,
    updatedAt: config.updatedAt ?? null,
  };
}

// ── Runtime dynamic registry ────────────────────────────────────────────────
//
// HQ-created launchers registered here are first-class: isKnownLauncher and
// getLauncherConfig consult this map after the static registry, which makes
// /intercept/:id routes, the shell guard, destination resolution and the
// availability selector work for them without a code release. Registration
// happens from the localStorage cache at startup (cold-start routes) and from
// fresh Supabase configs after fetch.

const DYNAMIC_LAUNCHERS = new Map();

export function registerDynamicLaunchers(configs = [], { replace = true } = {}) {
  if (replace) DYNAMIC_LAUNCHERS.clear();
  const registered = [];
  for (const config of Array.isArray(configs) ? configs : []) {
    if (config?.isCustom !== true) continue;
    const launcher = buildCustomLauncher(config);
    if (!launcher) continue;
    DYNAMIC_LAUNCHERS.set(launcher.id, launcher);
    registered.push(launcher);
  }
  return registered;
}

export function getDynamicLaunchers() {
  return Array.from(DYNAMIC_LAUNCHERS.values());
}

export function isStaticLauncher(launcherId) {
  return Boolean(LAUNCHER_REGISTRY[launcherId]);
}

export function getAllLauncherIds() {
  return [...LAUNCHER_IDS, ...DYNAMIC_LAUNCHERS.keys()];
}

export function resetDynamicLaunchersForTests() {
  DYNAMIC_LAUNCHERS.clear();
}

export function mergeLauncherConfigs(overrides = []) {
  const list = Array.isArray(overrides) ? overrides : [];
  const byId = Object.fromEntries(list.map((override) => [override.id, override]));
  const merged = FAKE_APP_LAUNCHERS.map((launcher) => mergeLauncherConfig(launcher, byId[launcher.id])).filter(Boolean);
  // HQ-created drafts ride along after the supported registry. Rows must be
  // explicitly flagged as custom — unknown non-custom IDs stay ignored.
  const customLaunchers = list
    .filter((override) => override?.isCustom === true && !LAUNCHER_REGISTRY[override.id])
    .map((override) => buildCustomLauncher(override))
    .filter(Boolean);
  return [...merged, ...customLaunchers];
}

export function getLauncherConfig(launcherId) {
  return LAUNCHER_REGISTRY[launcherId] ?? DYNAMIC_LAUNCHERS.get(launcherId) ?? null;
}

export function isKnownLauncher(launcherId) {
  return Boolean(getLauncherConfig(launcherId));
}

export function assertKnownLauncherId(launcherId) {
  if (!isKnownLauncher(launcherId)) {
    throw new Error("Only supported launcher IDs can be saved as live launcher configs.");
  }
}

export function getEnabledLaunchers() {
  return FAKE_APP_LAUNCHERS.filter((launcher) => launcher.enabled);
}

export function buildManifestForLauncher(launcher, origin = "https://drlizlondon.github.io") {
  const launchPath = launcher.launchPath.startsWith("/") ? launcher.launchPath : `/${launcher.launchPath}`;
  const startUrl = `${origin}/mybishbash${launchPath}`;
  const iconSrc = launcher.customIconSrc || launcher.iconSrc;
  const iconType = /\.svg(?:$|\?)/i.test(iconSrc)
    ? "image/svg+xml"
    : /\.jpe?g(?:$|\?)/i.test(iconSrc)
      ? "image/jpeg"
      : "image/png";

  return {
    name: launcher.displayName,
    short_name: launcher.displayName,
    id: startUrl,
    start_url: startUrl,
    scope: `${origin}/mybishbash/`,
    display: "standalone",
    background_color: LAUNCHER_THEME.backgroundColor,
    theme_color: LAUNCHER_THEME.themeColor,
    icons: [
      {
        src: iconSrc,
        sizes: "180x180",
        type: iconType,
      },
    ],
  };
}
