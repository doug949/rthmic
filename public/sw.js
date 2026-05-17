const CACHE_NAME = "rthmic-v4";
const AUDIO_CACHE_NAME = "rthmic-audio-v1";

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
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== AUDIO_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Audio (any origin) — cache-first ────────────────────────────────────
  // Covers Suno CDN and any other audio source. Caches on first play so the
  // track is available offline next time.
  if (request.destination === "audio") {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => cached || Response.error());
        })
      )
    );
    return;
  }

  // Only intercept same-origin GET from here on
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  // ── Next.js static bundles — cache-first (content-addressed, immutable) ─
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok)
              caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  // ── Static assets (manifest, icons) — cache-first ───────────────────────
  const isStaticAsset =
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/icons/");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok)
              caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
            return res;
          })
      )
    );
  }

  // All other GET requests (pages) — network only
});
