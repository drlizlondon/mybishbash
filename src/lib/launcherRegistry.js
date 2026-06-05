const LAUNCHER_TIMESTAMP = "2026-05-13T00:00:00.000Z";
const PLACEHOLDER_ICON_SRC = "/mybishbash/icons/mybishbash-cover.png";

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
  {
    id: "chrome",
    displayName: "Chrome",
    name: "Chrome",
    realAppLabel: "Chrome",
    category: "browser",
    installPath: "/mybishbash/install/chrome/",
    launchPath: "/intercept/chrome",
    manifestPath: "/mybishbash/launchers/chrome/manifest.webmanifest",
    iconSrc: PLACEHOLDER_ICON_SRC,
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
    iconSrc: PLACEHOLDER_ICON_SRC,
    customIconSrc: "",
    nativeAppUrl: "",
    webFallbackUrl: "https://web.whatsapp.com/",
    appUrl: "",
    // Needs manual iPhone PWA QA before enabling; WhatsApp Web is not a robust mobile-app destination.
    androidIntentUrl: "",
    androidWebFallbackUrl: "https://web.whatsapp.com/",
    iosAppUrl: "https://web.whatsapp.com/",
    iosWebFallbackUrl: "https://web.whatsapp.com/",
    manualUrl: "https://web.whatsapp.com/",
    defaultInterruptionPackId: "whatsapp-interruption",
    interruptionPackId: "",
    useInterruptionPack: true,
    interruptionPaused: false,
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
  "enabled",
  "hqVisible",
  "useInterruptionPack",
  "interruptionPackId",
];

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
    if (["enabled", "hqVisible", "useInterruptionPack"].includes(field)) {
      if (typeof value !== "boolean") return;
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
