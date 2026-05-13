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
      .register("/bishbash/service-worker.js", { scope: "/bishbash/" })
      .then((registration) => {
        console.log("[NOTIFICATIONS] Service worker registered", registration.scope);
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.error("[NOTIFICATIONS] Service worker registration failed", error);
      });
  });
}
