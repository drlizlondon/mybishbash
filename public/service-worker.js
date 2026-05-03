const CACHE_NAME = "bishbash-cache-v7";
const APP_SHELL = [
  "/bishbash/",
  "/bishbash/index.html",
  "/bishbash/manifest.webmanifest",
  "/bishbash/icons/apple-touch-icon.png",
  "/bishbash/icons/icon-192.svg",
  "/bishbash/icons/icon-512.svg",
  "/bishbash/icons/icon-maskable-512.svg",
  "/bishbash/assets/index.js",
  "/bishbash/assets/index.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    const url = new URL(event.request.url);
    const appRoute =
      url.pathname === "/bishbash/home" ||
      url.pathname === "/bishbash/library" ||
      url.pathname === "/bishbash/log" ||
      url.pathname === "/bishbash/packs" ||
      url.pathname === "/bishbash/mood" ||
      url.pathname === "/bishbash/settings" ||
      url.pathname.startsWith("/bishbash/card/") ||
      url.pathname === "/bishbash/caught-up" ||
      url.pathname.startsWith("/bishbash/intercept/");

    if (appRoute) {
      event.respondWith(caches.match("/bishbash/index.html"));
      return;
    }

    event.respondWith(
      fetch(event.request).catch(() => caches.match("/bishbash/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match("/bishbash/index.html"));
    }),
  );
});
