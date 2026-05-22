import type { PillarType, TimedWord } from "@/app/types/pipeline";

export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  lyrics?: string;
  savedAt: number;
  status: "new" | "active" | "favourite" | "archived" | "deleted";
  deletedAt?: number;
  tags?: string[];
  note?: string;
  playCount?: number;
  lastPlayedAt?: number;
  rthmixId?: string;
  rthmixTitle?: string;
  rthmixType?: "memory" | "progression";
  rthmixTrackNumber?: string;
  rthmixTrackRole?: "ground-zero" | "memory-hook" | "unlock" | "bonus";
  rthmixUnlock?: string;
  rthmixAlbumArtPrompt?: string;
  rthmixAlbumArtUrl?: string;
  pairId?: string;
  side?: "A" | "B";
  alternateId?: string;
  preferredSideId?: string;
  sunoClipId?: string;
  sunoTaskId?: string;
  timedLyrics?: TimedWord[];
  audioKey?: string;
}
