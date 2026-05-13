const CURRENT_VERSION = typeof __BISHBASH_VERSION__ === "string" ? __BISHBASH_VERSION__ : "dev";

export async function checkForAppUpdate(basePath = "/bishbash") {
  if (!basePath) return { updateAvailable: false, currentVersion: CURRENT_VERSION };

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

    return {
      currentVersion: CURRENT_VERSION,
      deployedVersion,
      updateAvailable: Boolean(deployedVersion && deployedVersion !== CURRENT_VERSION),
    };
  } catch {
    return { updateAvailable: false, currentVersion: CURRENT_VERSION };
  }
}

export async function refreshBishBashAppShell(basePath = "/bishbash") {
  await clearBishBashCaches();
  await updateServiceWorkers(basePath);
  window.location.reload();
}

export async function clearBishBashCaches() {
  if (!("caches" in window)) return;

  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("bishbash-")).map((key) => caches.delete(key)));
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
        registration.active?.postMessage({ type: "CLEAR_BISHBASH_CACHES" });
      } catch {
        await registration.unregister().catch(() => {});
      }
    }),
  );
}
