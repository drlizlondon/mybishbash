(async function () {
  const appBasePath = "/mybishbash";
  const NORMAL_APP_LAUNCHER = {
    id: "mybishbash",
    displayName: "MyBishBash",
    name: "MyBishBash",
    iconSrc: "/mybishbash/icons/mybishbash-cover.png",
    manifestPath: "/mybishbash/manifest.webmanifest",
    launchPath: "/home",
  };
  const registry = await loadRegistry(NORMAL_APP_LAUNCHER);
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const installIndex = pathParts.indexOf("install");
  const legacyLauncherId = pathParts[0] === "mybishbash" ? pathParts[1] : pathParts[0];
  const launcherId = installIndex >= 0 ? pathParts[installIndex + 1] : legacyLauncherId;
  const launcher = registry.launchers.find((item) => item.id === launcherId) ?? NORMAL_APP_LAUNCHER;

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

  document.title = version.id === "mybishbash" ? "MyBishBash" : `${version.displayName || version.name} · MyBishBash`;

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

  const launchLink = document.querySelector("[data-launch-link]");
  if (launchLink && version.launchPath) {
    launchLink.href = `${window.location.origin}${appBasePath}${version.launchPath}`;
    launchLink.addEventListener("click", () => {
      const pendingEvents = loadPendingEvents();
      pendingEvents.push({
        event_type: "fake_launcher_opened",
        launcher_id: version.id,
        route: version.launchPath,
        created_at: new Date().toISOString(),
        is_standalone: isStandalone,
        opened_from: "install_icon",
      });
      window.localStorage.setItem("mybishbash.pending-launcher-install.v1", JSON.stringify(pendingEvents.slice(-20)));
    });
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

async function loadRegistry(normalAppLauncher) {
  try {
    const response = await fetch("/mybishbash/launchers/registry.json", { cache: "no-store" });
    if (response.ok) {
      const registry = await response.json();
      const fakeLaunchers = Array.isArray(registry.launchers) ? registry.launchers : [];
      return { launchers: [normalAppLauncher, ...fakeLaunchers.filter((item) => item.id !== normalAppLauncher.id)] };
    }
  } catch {
    // Fall through to a minimal hardcoded fallback so install pages still render offline.
  }

  return { launchers: [normalAppLauncher] };
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
