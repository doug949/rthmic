const SW_VERSION = "rthmic-sw-audio-v2";
const AUDIO_CACHE_NAME = "rthmic-audio-v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== AUDIO_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_SW_VERSION") {
    event.source?.postMessage({ type: "SW_VERSION", version: SW_VERSION });
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "PURGE_APP_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== AUDIO_CACHE_NAME)
              .map((k) => caches.delete(k))
          )
        )
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

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

  // App shell, pages, Next bundles, and images are left to the browser/Vercel.
  // Only audio is service-worker cached, which avoids stale app versions while
  // preserving offline Rthm playback.
});
