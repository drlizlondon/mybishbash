const CACHE_NAME = "bishbash-cache-v2";
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
