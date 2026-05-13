// Fires a single Suno generate request and returns the taskId immediately.
// The client polls /api/poll-generation?taskId=... every 5s until ready.
// Suno naturally returns 2 clips per call — variation is handled at the Suno level.

import { NextRequest, NextResponse } from "next/server";
import type { StyleChoice } from "@/app/services/llmService";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";

const BASE_URL = "https://api.sunoapi.org/api/v1";

async function getVocalistPref(req: NextRequest): Promise<"male" | "female" | "none"> {
  try {
    if (!process.env.REDIS_URL) return "none";
    const session = req.cookies.get("rthmic_session");
    if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return "none";
    const uid = req.cookies.get("rthmic_uid")?.value;
    if (!uid) return "none";
    const { createClient } = await import("redis");
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    try {
      const raw = await client.get(`settings:${uid}`);
      if (!raw) return "none";
      const settings = JSON.parse(raw);
      return settings.vocalist === "male" || settings.vocalist === "female" ? settings.vocalist : "none";
    } finally { await client.disconnect(); }
  } catch { return "none"; }
}
const SUNO_CHAR_LIMIT = 5000;

// Suno's style field rejects full sentences — convert periods to commas.
// Also enforces a 200-char hard cap as a safety net, truncating at the
// last comma so we don't cut mid-tag.
const SUNO_STYLE_LIMIT = 200;
const FADE_SUFFIX = ", fade out ending, resolving outro";

function buildMusicStyle(_style: StyleChoice, genre: string): string {
  // Convert sentence endings to comma-separated tags
  const cleaned = genre
    .replace(/\.\s*/g, ", ")
    .replace(/,\s*,+/g, ",")
    .trim()
    .replace(/,\s*$/, "");

  const full = `${cleaned}${FADE_SUFFIX}`;
  if (full.length <= SUNO_STYLE_LIMIT) return full;

  // Truncate: fit as many comma-separated tags as possible within the limit
  const budget = SUNO_STYLE_LIMIT - FADE_SUFFIX.length;
  const truncated = cleaned.slice(0, budget);
  const lastComma = truncated.lastIndexOf(",");
  const base = lastComma > 0 ? truncated.slice(0, lastComma) : truncated;
  console.warn(`Style truncated from ${full.length} to ${(base + FADE_SUFFIX).length} chars`);
  return `${base}${FADE_SUFFIX}`;
}

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  if (!process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const lyrics = toSunoPronunciation(
      typeof body.lyrics === "string" ? body.lyrics.slice(0, SUNO_CHAR_LIMIT) : ""
    );
    const style = (body.style as StyleChoice) ?? "B";
    const rawGenre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : "Indie Electronic";
    const vocalist = await getVocalistPref(req);
    const genre = vocalist !== "none" ? `${rawGenre}, ${vocalist} vocalist` : rawGenre;
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
        model: "V5",
        prompt: lyrics,
        style: buildMusicStyle(style, genre),
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
