// Personal library — localStorage persistence for user-generated rhythms.
// All reads/writes are SSR-safe (guarded by typeof window check).
// Suno audio URLs expire after ~24–48h; playback will silently fail on old entries.

import type { PillarType } from "@/app/types/pipeline";

const STORAGE_KEY = "rthmic_personal_library_v1";

export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  savedAt: number;
  status: "active" | "archived";
}

function readStore(): SavedRhythm[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedRhythm[]) : [];
  } catch {
    return [];
  }
}

function writeStore(items: SavedRhythm[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function loadLibrary(): SavedRhythm[] {
  return readStore().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveRhythm(rhythm: Omit<SavedRhythm, "savedAt" | "status">): void {
  const items = readStore();
  // Deduplicate by id
  const filtered = items.filter((r) => r.id !== rhythm.id);
  writeStore([{ ...rhythm, savedAt: Date.now(), status: "active" }, ...filtered]);
}

export function removeRhythm(id: string): void {
  writeStore(readStore().filter((r) => r.id !== id));
}

export function setRhythmStatus(id: string, status: SavedRhythm["status"]): void {
  writeStore(readStore().map((r) => (r.id === id ? { ...r, status } : r)));
}
