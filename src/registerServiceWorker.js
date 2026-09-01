import { BASE } from "./lib/basePath";

function debugLog(...args) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[NOTIFICATIONS] Service workers are not supported.");
    return;
  }

  window.addEventListener("load", () => {
    if (!import.meta.env.PROD) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister().catch(() => {});
        });
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.delete(key).catch(() => {});
          });
        });
      }

      return;
    }

    navigator.serviceWorker
      .register(`${BASE}service-worker.js`, { scope: BASE })
      .then((registration) => {
        debugLog("[NOTIFICATIONS] Service worker registered", registration.scope);
        registration.addEventListener("updatefound", () => {
          debugLog("[SERVICE_WORKER] updatefound", {
            scope: registration.scope,
            state: registration.installing?.state,
          });
          registration.installing?.addEventListener("statechange", () => {
            debugLog("[SERVICE_WORKER] installing statechange", {
              scope: registration.scope,
              state: registration.installing?.state,
            });
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          debugLog("[SERVICE_WORKER] controllerchange", { scope: registration.scope });
        });
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.error("[NOTIFICATIONS] Service worker registration failed", error);
      });
  });
}
