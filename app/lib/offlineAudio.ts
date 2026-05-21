"use client";

import type { SavedRhythm } from "@/app/api/library/route";

export const AUDIO_CACHE = "rthmic-audio-v1";
export const KEEP_ALL_OFFLINE_KEY = "rthmic_keep_all_offline";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function audioCacheUrl(id: string): string {
  return `/api/proxy-audio?id=${encodeURIComponent(id)}`;
}

export function keepAllOfflineEnabled(): boolean {
  try {
    return localStorage.getItem(KEEP_ALL_OFFLINE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setKeepAllOffline(enabled: boolean): void {
  localStorage.setItem(KEEP_ALL_OFFLINE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent("offline-audio-setting-changed", { detail: { enabled } }));
}

export async function cacheRhythmAudio(rhythm: Pick<SavedRhythm, "id" | "audioUrl" | "audioKey">): Promise<void> {
  if (!rhythm.id || (!rhythm.audioUrl && !rhythm.audioKey) || !("caches" in window)) return;
  const cache = await caches.open(AUDIO_CACHE);
  const url = audioCacheUrl(rhythm.id);
  if (await cache.match(url)) return;
  await cache.add(url);
}

export async function deleteRhythmAudio(id: string): Promise<void> {
  if (!id || !("caches" in window)) return;
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(audioCacheUrl(id));
}

export async function pruneDeletedOfflineAudio(rhythms: SavedRhythm[]): Promise<void> {
  const cutoff = Date.now() - THIRTY_DAYS;
  const expiredDeleted = rhythms.filter((r) => r.status === "deleted" && (r.deletedAt ?? 0) < cutoff);
  await Promise.all(expiredDeleted.map((r) => deleteRhythmAudio(r.id)));
}
