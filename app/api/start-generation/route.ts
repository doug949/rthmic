// Fires a single Suno generate request and returns the taskId immediately.
// The client polls /api/poll-generation?taskId=... every 5s until ready.
// Suno naturally returns 2 clips per call — variation is handled at the Suno level.

import { NextRequest, NextResponse } from "next/server";
import type { StyleChoice } from "@/app/services/llmService";

const BASE_URL = "https://api.sunoapi.org/api/v1";
const SUNO_CHAR_LIMIT = 5000;

// Both styles share the same indie-electronic aesthetic — same genre, same warmth, same instruments.
// "fade out ending" and "resolving outro" are audio-level tags Suno uses for musical resolution.
// They prevent abrupt cut-offs by signalling that the track should close naturally.
const MUSIC_STYLES: Record<StyleChoice, string> = {
  A: "indie electronic, uplifting male vocal, acoustic guitar, warm synth pads, 95bpm, motivational, grounded energy, human feel, positive, fade out ending, resolving outro",
  B: "indie folk electronic, reflective male vocal, acoustic guitar, soft pads, 80bpm, meditative, calm focus, introspective, warm, fade out ending, resolving outro",
};

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  if (!process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const lyrics = typeof body.lyrics === "string" ? body.lyrics.slice(0, SUNO_CHAR_LIMIT) : "";
    const style = (body.style as StyleChoice) ?? "B";
    const songTitle = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "RTHM";

    if (!lyrics.trim()) {
      return NextResponse.json({ error: "lyrics required" }, { status: 400 });
    }

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
        prompt: lyrics,
        style: MUSIC_STYLES[style],
        title: songTitle,
        callBackUrl: "https://rthmic.vercel.app/api/suno-webhook",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Suno generate error ${res.status}: ${text}`);
    }

    const json = await res.json();
    console.log("Suno start response:", JSON.stringify(json));

    const taskId: string =
      json.data?.taskId ??
      (typeof json.data === "string" ? json.data : undefined) ??
      json.taskId;

    if (!taskId) {
      throw new Error(
        `Suno returned no taskId. Response: ${JSON.stringify(json).slice(0, 400)}`
      );
    }

    return NextResponse.json({ taskId });
  } catch (err) {
    console.error("Start generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation" },
      { status: 500 }
    );
  }
}
