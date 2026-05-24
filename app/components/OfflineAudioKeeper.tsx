"use client";

import { useEffect } from "react";
import type { SavedRhythm } from "@/app/types/library";
import { cacheRhythmAudio, keepAllOfflineEnabled, pruneDeletedOfflineAudio } from "@/app/lib/offlineAudio";

export default function OfflineAudioKeeper() {
  useEffect(() => {
    let cancelled = false;
    let running = false;

    const sync = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const res = await fetch("/api/library", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { rhythms?: SavedRhythm[] };
        const rhythms = data.rhythms ?? [];
        await pruneDeletedOfflineAudio(rhythms);

        if (!keepAllOfflineEnabled()) return;
        const playable = rhythms.filter((r) =>
          r.status !== "deleted" &&
          (r.audioUrl || r.audioKey)
        );
        for (const rhythm of playable) {
          if (cancelled || !keepAllOfflineEnabled()) break;
          try {
            await cacheRhythmAudio(rhythm);
          } catch {
            // Device storage, network, or auth may fail; keep the app quiet.
          }
        }
      } finally {
        running = false;
      }
    };

    const onSettingChanged = () => sync();
    const onLibraryMutated = () => sync();
    window.addEventListener("offline-audio-setting-changed", onSettingChanged);
    window.addEventListener("library-mutated", onLibraryMutated);
    sync();
    const interval = window.setInterval(sync, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("offline-audio-setting-changed", onSettingChanged);
      window.removeEventListener("library-mutated", onLibraryMutated);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
