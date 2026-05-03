// /api/generate-music — step 2 of the split pipeline
// Generates Suno songs from lyrics + pillar.
// Long-running (30-180s). maxDuration = 240.
// No mock fallback — if Suno fails, returns an error.

import { NextRequest, NextResponse } from "next/server";
import { generateSongs } from "@/app/services/musicService";
import type { PillarType } from "@/app/types/pipeline";

export const maxDuration = 240; // Suno can take 80-180s; poll window is 200s

// Suno's hard character limit for the prompt field
const SUNO_CHAR_LIMIT = 5000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const lyrics = typeof body.lyrics === "string" ? body.lyrics : "";
    const pillar = body.pillar as PillarType;

    if (!lyrics.trim()) {
      return NextResponse.json({ error: "lyrics required" }, { status: 400 });
    }
    if (!pillar) {
      return NextResponse.json({ error: "pillar required" }, { status: 400 });
    }

    // Enforce Suno's 5000-character limit
    const safeLyrics = lyrics.slice(0, SUNO_CHAR_LIMIT);

    const songs = await generateSongs(safeLyrics, pillar);
    return NextResponse.json({ songs });
  } catch (err) {
    console.error("Generate music error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Music generation failed" },
      { status: 500 }
    );
  }
}
