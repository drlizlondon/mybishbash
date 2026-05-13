export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

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
        registration.update().catch(() => {});
      })
      .catch(() => {});
  });
}
