const LAUNCHER_TIMESTAMP = "2026-05-13T00:00:00.000Z";

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
    webFallbackUrl: "x-safari-https://www.google.com",
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
    enabled: true,
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
  "enabled",
  "hqVisible",
  "useInterruptionPack",
  "interruptionPackId",
];

export function sanitizeLauncherUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|x-safari-|instagram:\/\/|youtube:\/\/|intent:\/\/)/i.test(trimmed)) {
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
    if (field.endsWith("Url")) {
      normalized[field] = sanitizeLauncherUrl(value);
      return;
    }
    if (["enabled", "hqVisible", "useInterruptionPack"].includes(field)) {
      normalized[field] = Boolean(value);
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
  return {
    ...merged,
    name: merged.name || merged.displayName || defaultLauncher.name,
    displayName: merged.displayName || merged.name || defaultLauncher.displayName,
    realAppLabel: merged.realAppLabel ?? defaultLauncher.realAppLabel,
    updatedAt: override.updatedAt ?? override.updated_at ?? defaultLauncher.updatedAt,
  };
}

export function mergeLauncherConfigs(overrides = []) {
  const byId = Object.fromEntries((Array.isArray(overrides) ? overrides : []).map((override) => [override.id, override]));
  return FAKE_APP_LAUNCHERS.map((launcher) => mergeLauncherConfig(launcher, byId[launcher.id])).filter(Boolean);
}

export function getLauncherConfig(launcherId) {
  return LAUNCHER_REGISTRY[launcherId] ?? null;
}

export function isKnownLauncher(launcherId) {
  return Boolean(getLauncherConfig(launcherId));
}

export function getEnabledLaunchers() {
  return FAKE_APP_LAUNCHERS.filter((launcher) => launcher.enabled);
}

export function buildManifestForLauncher(launcher, origin = "https://drlizlondon.github.io") {
  const launchPath = launcher.launchPath.startsWith("/") ? launcher.launchPath : `/${launcher.launchPath}`;
  const startUrl = `${origin}/mybishbash${launchPath}`;
  const iconSrc = launcher.customIconSrc || launcher.iconSrc;
  const iconType = /\.jpe?g(?:$|\?)/i.test(iconSrc) ? "image/jpeg" : "image/png";

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
