"use client";
import { useState, useEffect } from "react";

const AUDIO_CACHE = "rthmic-audio-v1";

export function useOfflineAudio(audioUrl: string | undefined) {
  const [isCached, setIsCached] = useState(false);
  const [caching, setCaching] = useState(false);

  useEffect(() => {
    if (!audioUrl || typeof window === "undefined" || !("caches" in window)) return;
    caches.open(AUDIO_CACHE).then((cache) =>
      cache.match(audioUrl).then((match) => setIsCached(!!match))
    ).catch(() => {});
  }, [audioUrl]);

  const cacheTrack = async () => {
    if (!audioUrl || !("caches" in window) || caching || isCached) return;
    setCaching(true);
    try {
      const cache = await caches.open(AUDIO_CACHE);
      await cache.add(audioUrl);
      setIsCached(true);
    } catch {
      // silent — no audio URL or cache unavailable
    } finally {
      setCaching(false);
    }
  };

  return { isCached, cacheTrack, caching };
}
