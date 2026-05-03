// Fires TWO parallel Suno generate requests (Style A + Style B) and returns both taskIds.
// The client polls /api/poll-generation?taskIdA=...&taskIdB=... every 5s until both are ready.
// Two calls guarantees meaningful musical variation — same lyrics, two distinct productions.

import { NextRequest, NextResponse } from "next/server";
import type { PillarType } from "@/app/types/pipeline";

const BASE_URL = "https://api.sunoapi.org/api/v1";
const SUNO_CHAR_LIMIT = 5000;

// Style A — direct, energetic, upbeat pop (pairs with Song A lyrics: direct/motivational)
// Style B — reflective, hypnotic, minimal house (pairs with Song B lyrics: reflective/expansive)
const MUSIC_STYLES = {
  A: "sunny upbeat pop, 90s 00s vibe, male vocal, relaxed talk-sung, bright guitar, funky bass, light drums, handclaps, catchy singalong chorus, feel-good hook, warm, slightly lo-fi, playful, human",
  B: "positive minimal house, morning vibe, warm male voice, slightly vocoded, hypnotic repetitive focus mantra, clean electronic groove, soft synth pads, pulsing bass, minimal percussion, comforting, scandinavian, motivating",
} as const;

export const maxDuration = 20;

async function startSunoJob(lyrics: string, style: "A" | "B", title: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customMode: true,
      instrumental: false,
      model: "V4_5",
      prompt: lyrics.slice(0, SUNO_CHAR_LIMIT),
      style: MUSIC_STYLES[style],
      title,
      callBackUrl: "https://rthmic.vercel.app/api/suno-webhook",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Suno generate error ${res.status}: ${body}`);
  }

  const json = await res.json();
  console.log(`Suno start response (${style}):`, JSON.stringify(json));

  const taskId: string =
    json.data?.taskId ??
    (typeof json.data === "string" ? json.data : undefined) ??
    json.taskId;

  if (!taskId) {
    throw new Error(
      `Suno returned no taskId for style ${style}. Response: ${JSON.stringify(json).slice(0, 400)}`
    );
  }

  return taskId;
}

export async function POST(req: NextRequest) {
  if (!process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const lyricsA = typeof body.lyricsA === "string" ? body.lyricsA : "";
    const lyricsB = typeof body.lyricsB === "string" ? body.lyricsB : "";
    const pillar = body.pillar as PillarType;
    const titleA = typeof body.titleA === "string" && body.titleA.trim() ? body.titleA.trim() : `RTHM — ${pillar}`;
    const titleB = typeof body.titleB === "string" && body.titleB.trim() ? body.titleB.trim() : `RTHM — ${pillar} (Alt)`;

    if (!lyricsA.trim() || !lyricsB.trim() || !pillar) {
      return NextResponse.json({ error: "lyricsA, lyricsB, and pillar required" }, { status: 400 });
    }

    // Fire both calls in parallel — they are independent
    const [taskIdA, taskIdB] = await Promise.all([
      startSunoJob(lyricsA, "A", titleA),
      startSunoJob(lyricsB, "B", titleB),
    ]);

    return NextResponse.json({ taskIdA, taskIdB });
  } catch (err) {
    console.error("Start generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation" },
      { status: 500 }
    );
  }
}
