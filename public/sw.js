self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log("[OLD CACHE DELETED]", cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});