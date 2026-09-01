import { BASE_NO_SLASH } from "./lib/basePath";

const CURRENT_VERSION = typeof __MYBISHBASH_VERSION__ === "string" ? __MYBISHBASH_VERSION__ : "dev";
const CURRENT_SOURCE_SHA = import.meta.env.VITE_SOURCE_SHA || import.meta.env.VITE_GIT_SHA || "";
const LEGACY_CACHE_PREFIX = "bish" + "bash-";

// basePath has no trailing slash and is "" at the root domain.
export async function checkForAppUpdate(basePath = BASE_NO_SLASH) {
  if (basePath == null) return { updateAvailable: false, currentVersion: CURRENT_VERSION };

  try {
    const response = await fetch(`${basePath}/version.json?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      return { updateAvailable: false, currentVersion: CURRENT_VERSION };
    }

    const deployed = await response.json();
    const deployedVersion = deployed?.version;
    const result = {
      currentVersion: CURRENT_VERSION,
      currentSourceSha: CURRENT_SOURCE_SHA,
      deployedVersion,
      sourceSha: deployed?.sourceSha ?? "",
      updateAvailable: Boolean(deployedVersion && deployedVersion !== CURRENT_VERSION),
    };

    return result;
  } catch {
    return { updateAvailable: false, currentVersion: CURRENT_VERSION };
  }
}

export async function refreshMyBishBashAppShell(basePath = BASE_NO_SLASH) {
  await clearMyBishBashCaches();
  await updateServiceWorkers(basePath);
  window.location.reload();
}

export async function clearMyBishBashCaches() {
  if (!("caches" in window)) return;

  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("mybishbash-") || key.startsWith(LEGACY_CACHE_PREFIX)).map((key) => caches.delete(key)));
}

async function updateServiceWorkers(basePath) {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  const scopedRegistrations = registrations.filter((registration) =>
    registration.scope.includes(`${window.location.origin}${basePath}/`),
  );

  await Promise.all(
    scopedRegistrations.map(async (registration) => {
      try {
        await registration.update();
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        registration.active?.postMessage({ type: "CLEAR_MYBISHBASH_CACHES" });
      } catch {
        await registration.unregister().catch(() => {});
      }
    }),
  );
}
