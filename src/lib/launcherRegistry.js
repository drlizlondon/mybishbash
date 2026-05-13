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
  const iconType = /\.jpe?g(?:$|\?)/i.test(launcher.iconSrc) ? "image/jpeg" : "image/png";

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
        src: launcher.iconSrc,
        sizes: "180x180",
        type: iconType,
      },
    ],
  };
}
