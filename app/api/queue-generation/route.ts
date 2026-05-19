// POST /api/queue-generation
// Accepts a generation job, writes it to the Redis queue, and returns immediately.
// The cron at /api/process-queue picks it up within the next minute.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { pushJob } from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";
import type { StyleChoice } from "@/app/services/llmService";
import type { PillarType } from "@/app/types/pipeline";

export const maxDuration = 15;

const SUNO_CHAR_LIMIT = 5000;
const SUNO_STYLE_LIMIT = 200;
const FADE_SUFFIX = ", fade out ending, resolving outro";

function buildMusicStyle(genre: string): string {
  const cleaned = genre.replace(/\.\s*/g, ", ").replace(/,\s*,+/g, ",").trim().replace(/,\s*$/, "");
  const full = `${cleaned}${FADE_SUFFIX}`;
  if (full.length <= SUNO_STYLE_LIMIT) return full;
  const budget = SUNO_STYLE_LIMIT - FADE_SUFFIX.length;
  const truncated = cleaned.slice(0, budget);
  const lastComma = truncated.lastIndexOf(",");
  const base = lastComma > 0 ? truncated.slice(0, lastComma) : truncated;
  return `${base}${FADE_SUFFIX}`;
}

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

async function getVocalistPref(uid: string): Promise<"male" | "female" | "none"> {
  try {
    if (!process.env.REDIS_URL) return "none";
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

export async function POST(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ error: "Queue not configured" }, { status: 500 });

  const body = await req.json();
  const rawLyrics = typeof body.lyrics === "string" ? body.lyrics : "";
  const style = (body.style as StyleChoice) ?? "B";
  const rawGenre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : "Indie Electronic";
  const pillar = body.pillar as PillarType;
  const title = typeof body.title === "string" ? body.title.slice(0, 80) : "RTHM";
  const note = typeof body.note === "string" ? body.note : undefined;
  const menuSlug = typeof body.menuSlug === "string" ? body.menuSlug : undefined;

  if (!rawLyrics.trim()) return NextResponse.json({ error: "lyrics required" }, { status: 400 });

  const vocalist = await getVocalistPref(uid);
  const genre = vocalist !== "none" ? `${rawGenre}, ${vocalist} vocalist` : rawGenre;
  const lyrics = toSunoPronunciation(rawLyrics.slice(0, SUNO_CHAR_LIMIT));
  const builtStyle = buildMusicStyle(genre);

  const jobId = crypto.randomUUID();
  const job: QueueJob = {
    jobId,
    userId: uid,
    status: "pending",
    pillar,
    title,
    style,
    lyrics,
    genre: builtStyle,
    note,
    menuSlug,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await pushJob(job);

  return NextResponse.json({ jobId });
}
