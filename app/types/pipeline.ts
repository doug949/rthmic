export type PillarType = "Memory" | "Menus" | "Mindset" | "Mode" | "Movement" | "Understanding" | "Bridge" | "Invite" | "Journal" | "Epiphany" | "Explain" | "BookSummary";

// Legacy pillar names stored in older Redis entries.
// Map at read-time only — never produce these from new generation.
export const LEGACY_PILLAR_MAP: Record<string, PillarType> = {
  // Exact old values (TitleCase)
  Memorisation: "Memory",
  Menu:         "Menus",
  Algorithm:    "Movement",
  Mantra:       "Movement",
  Master:       "Understanding",
  "Mode-shift": "Mode",
  // Lowercase variants that may appear in stored data
  memorisation: "Memory",
  menu:         "Menus",
  algorithm:    "Movement",
  mantra:       "Movement",
  master:       "Understanding",
  "mode-shift": "Mode",
  // Current pillars (pass-through, needed for case-insensitive safety)
  memory:       "Memory",
  menus:        "Menus",
  mindset:      "Mindset",
  mode:         "Mode",
  movement:     "Movement",
  understanding: "Understanding",
  bridge: "Bridge",
  invite: "Invite",
  journal: "Journal",
  epiphany:     "Epiphany",
  explain:      "Explain",
  booksummary:  "BookSummary",
  "book summary": "BookSummary",
  "book-summary": "BookSummary",
};

export function normalisePillar(raw: string): PillarType {
  return LEGACY_PILLAR_MAP[raw] ?? LEGACY_PILLAR_MAP[raw.toLowerCase()] ?? "Mindset";
}

export interface StateSummary {
  state: string;
  intent: string;
  friction: string;
}

/** One word from Suno's word-level synchronized lyric data */
export interface TimedWord {
  word: string;
  startS: number;   // start time in seconds
  endS: number;     // end time in seconds
  success: boolean; // Suno confidence flag
}

export interface Song {
  id: string;
  title: string;
  audioUrl?: string;       // real Suno audio URL
  trackId?: string;        // mock: references existing library track
  trackAudioKey?: string;  // mock: audio key for signed URL
  sunoClipId?: string;     // raw Suno clip ID (= audioId for timed-lyrics API)
  sunoTaskId?: string;     // Suno task ID — required alongside audioId to fetch timed lyrics
}

export interface PipelineResult {
  transcript: string;
  pillar: PillarType;
  stateSummary: StateSummary;
  lyrics: string;
  songs: [Song, Song];
}

export type SongStatus = "favorite" | "archived" | "deleted" | null;
export type SongStatusMap = Record<string, SongStatus>;
