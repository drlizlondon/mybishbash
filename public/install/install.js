(async function () {
  const appBasePath = "/mybishbash";
  const registry = await loadRegistry();
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const installIndex = pathParts.indexOf("install");
  const legacyLauncherId = pathParts[0] === "mybishbash" ? pathParts[1] : pathParts[0];
  const launcherId = installIndex >= 0 ? pathParts[installIndex + 1] : legacyLauncherId;
  const launcher = registry.launchers.find((item) => item.id === launcherId) ?? registry.launchers[0];

  if (!launcher) return;

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone && launcher.launchPath) {
    window.location.replace(`${appBasePath}${launcher.launchPath}`);
    return;
  }

  const stored = loadStoredVersions();
  const storedLauncher = stored[launcher.id] || {};
  const version = { ...launcher, ...storedLauncher };
  const iconSrc = version.customIconSrc || version.iconSrc;

  document.title = `${version.displayName || version.name} · MyBishBash`;

  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", version.displayName || version.name);

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) manifestLink.setAttribute("href", version.manifestPath);

  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (touchIcon) touchIcon.setAttribute("href", iconSrc);

  const iconImage = document.querySelector("[data-install-icon]");
  if (iconImage) {
    iconImage.src = iconSrc;
    iconImage.alt = `${version.displayName || version.name} icon`;
  }

  const versionName = document.querySelector("[data-version-name]");
  if (versionName) versionName.textContent = version.displayName || version.name;

  const launcherContext = document.querySelector("[data-launcher-context]");
  if (launcherContext) launcherContext.textContent = version.id;

  const settingsLink = document.querySelector("[data-settings-link]");
  if (settingsLink) settingsLink.href = `${window.location.origin}${appBasePath}/settings`;

  const pendingEvents = loadPendingEvents();
  pendingEvents.push(
    {
      event_type: "fake_launcher_install_page_viewed",
      launcher_id: version.id,
      route: window.location.pathname,
      created_at: new Date().toISOString(),
      is_standalone: isStandalone,
    },
    {
      event_type: "fake_launcher_manifest_loaded",
      launcher_id: version.id,
      route: version.manifestPath,
      created_at: new Date().toISOString(),
      is_standalone: isStandalone,
    },
  );
  window.localStorage.setItem(
    "mybishbash.pending-launcher-install.v1",
    JSON.stringify(pendingEvents.slice(-20)),
  );
})();

async function loadRegistry() {
  try {
    const response = await fetch("/mybishbash/launchers/registry.json", { cache: "no-store" });
    if (response.ok) return response.json();
  } catch {
    // Fall through to a minimal hardcoded fallback so install pages still render offline.
  }

  return {
    launchers: [
      {
        id: "safari",
        displayName: "Safari",
        iconSrc: "/mybishbash/icons/apple-touch-icon.png",
        manifestPath: "/mybishbash/launchers/safari/manifest.webmanifest",
        launchPath: "/intercept/safari",
      },
    ],
  };
}

function loadStoredVersions() {
  try {
    return JSON.parse(window.localStorage.getItem("mybishbash.home-screen-versions.v1") || "{}");
  } catch {
    return {};
  }
}

function loadPendingEvents() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("mybishbash.pending-launcher-install.v1") || "[]");
    return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
  } catch {
    return [];
  }
}
