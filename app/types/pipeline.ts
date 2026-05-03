export type PillarType = "Mode" | "Algorithm" | "Menu" | "Memorisation" | "Mindset";

export interface StateSummary {
  state: string;
  intent: string;
  friction: string;
}

export interface Song {
  id: string;
  title: string;
  audioUrl?: string;       // real Suno audio URL
  trackId?: string;        // mock: references existing library track
  trackAudioKey?: string;  // mock: audio key for signed URL
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
