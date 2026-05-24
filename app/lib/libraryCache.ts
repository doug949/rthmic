import type { SavedRhythm } from "@/app/types/library";

const KEY = "rthmic_library_cache";

export function saveLibraryCache(rhythms: SavedRhythm[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rhythms));
  } catch { /* storage full or unavailable — silent */ }
}

export function loadLibraryCache(): SavedRhythm[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRhythm[]) : [];
  } catch {
    return [];
  }
}
