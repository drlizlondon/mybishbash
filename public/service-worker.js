const CACHE_PREFIX = "bishbash-";
const HTML_CACHE = `${CACHE_PREFIX}html-v1`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v1`;
const MEDIA_CACHE = `${CACHE_PREFIX}media-v1`;
const APP_BASE = "/bishbash/";
const INDEX_URL = "/bishbash/index.html";

const MEDIA_EXTENSIONS = [
  ".avif",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
  ".webp",
  ".webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(HTML_CACHE)
      .then((cache) =>
        fetch(INDEX_URL, { cache: "no-store" })
          .then((response) => {
            if (response.ok) return cache.put(INDEX_URL, response);
            return undefined;
          })
          .catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && ![HTML_CACHE, RUNTIME_CACHE, MEDIA_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "CLEAR_BISHBASH_CACHES") {
    event.waitUntil(clearBishBashCaches());
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return;

  if (event.request.mode === "navigate" || acceptsHtml(event.request)) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }

  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (isScriptOrStyle(event.request)) {
    event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
    return;
  }

  if (isCacheableMedia(url.pathname)) {
    event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  console.log("[NOTIFICATIONS] Push received", data);

  event.waitUntil(
    self.registration.showNotification(data.title || "Tiny BishBash moment?", {
      body: data.body || "Something you said mattered.",
      icon: "/bishbash/icons/icon-192.svg",
      badge: "/bishbash/icons/icon-192.svg",
      data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = normalizeNotificationUrl(event.notification.data?.url);
  console.log("[NOTIFICATIONS] Notification clicked", urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i += 1) {
        const client = windowClients[i];

        if ("focus" in client) {
          client.navigate?.(urlToOpen);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return undefined;
    }),
  );
});

function normalizeNotificationUrl(rawUrl) {
  const fallback = new URL("/bishbash/home", self.location.origin);

  try {
    const url = new URL(rawUrl || fallback.toString(), self.location.origin);
    if (url.origin !== self.location.origin) return fallback.toString();

    if (url.pathname === "/bishbash/" || url.pathname === "/bishbash/index.html") {
      const route = url.searchParams.get("route");
      if (route) {
        const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
        url.pathname = `/bishbash${normalizedRoute}`;
        url.searchParams.delete("route");
      }
    }

    if (!url.pathname.startsWith("/bishbash/")) return fallback.toString();
    return url.toString();
  } catch (error) {
    console.warn("[NOTIFICATIONS] Invalid notification URL", rawUrl, error);
    return fallback.toString();
  }
}

async function networkFirstHtml(request) {
  const cache = await caches.open(HTML_CACHE);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(INDEX_URL, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(INDEX_URL)) || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function clearBishBashCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
}

function acceptsHtml(request) {
  return request.headers.get("accept")?.includes("text/html");
}

function isScriptOrStyle(request) {
  return request.destination === "script" || request.destination === "style";
}

function isCacheableMedia(pathname) {
  return MEDIA_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
