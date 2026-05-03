export type Pillar = "Memorization" | "Menus" | "Mindset" | "Mode" | "Algorithm";

export interface RthmDNA {
  title: string;
  state: string;
  intent: string;
  type: Pillar;
  algorithm: string;
  rhythmNotes: string;
  voiceStyle: string;
  tags: string[];
  duration: string;
}

export interface GenerateRequest {
  transcript: string;
}

export interface GenerateResponse {
  state: string;
  intent: string;
  friction: string;
  type: Pillar;
  dna: RthmDNA;
  sunoPrompt: string;
  matchingTrackIds: string[];
  thinking?: string;
}
