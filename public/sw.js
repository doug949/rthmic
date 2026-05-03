const CACHE_NAME = "rthmic-v3";

// Only truly static assets get cached — everything else goes to network
const PRECACHE = ["/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: cross-origin, non-GET, API routes, Next.js internals
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;

  // For everything else (pages, manifest): network-first, no caching of pages
  // Only cache the manifest and static assets in /icons/
  const isStaticAsset =
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/icons/");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          }
          return res;
        })
      )
    );
  }
  // All other GET requests (pages) go straight to network — no caching
});
