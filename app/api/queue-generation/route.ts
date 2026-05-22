// POST /api/queue-generation
// Accepts a job, starts the Suno generation immediately (up to MAX_CONCURRENT),
// writes the job to Redis, and returns immediately.
// The cron at /api/process-queue handles polling for completion.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { withRedisQueue, getUserJobIds, getJob, pushJob, updateJob, indexTaskId } from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";
import { extractSunoTaskId } from "@/app/lib/sunoResponse";
import type { StyleChoice } from "@/app/services/llmService";
import type { PillarType } from "@/app/types/pipeline";

export const maxDuration = 30;

const MAX_CONCURRENT = 5;
const SUNO_CHAR_LIMIT = 5000;
const SUNO_STYLE_LIMIT = 200;
const FADE_SUFFIX = ", fade out ending, resolving outro";
const SUNO_BASE = "https://api.sunoapi.org/api/v1";
const APP_URL = "https://rthmic.app";

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
      const s = JSON.parse(raw);
      return s.vocalist === "male" || s.vocalist === "female" ? s.vocalist : "none";
    } finally { await client.disconnect(); }
  } catch { return "none"; }
}

async function countGenerating(client: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const ids = await getUserJobIds(client, userId);
  let count = 0;
  for (const id of ids) {
    const j = await getJob(client, id);
    if (j?.status === "generating") count++;
  }
  return count;
}

async function startSunoJob(job: QueueJob): Promise<string | null> {
  try {
    const res = await fetch(`${SUNO_BASE}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customMode: true,
        instrumental: false,
        model: "V5",
        prompt: job.lyrics,
        style: job.genre,
        title: job.title,
        callBackUrl: `${APP_URL}/api/suno-webhook`,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[queue] Suno start failed: ${res.status} ${text}`);
      return null;
    }
    const json = await res.json();
    const taskId = extractSunoTaskId(json);
    if (!taskId) {
      console.error(`[queue] Suno start returned no taskId for ${job.jobId}: ${JSON.stringify(json).slice(0, 400)}`);
    }
    return taskId;
  } catch (err) {
    console.error("[queue] Suno start error:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ error: "Queue not configured" }, { status: 500 });
  if (!process.env.SUNO_API_KEY) return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });

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

  // Write to Redis first so the job is visible immediately
  await pushJob(job);

  // Attempt to start the Suno job immediately if under the concurrent cap.
  // If this fails or we're at capacity, the cron will pick it up.
  await withRedisQueue(async (client) => {
    const generating = await countGenerating(client, uid);
    if (generating >= MAX_CONCURRENT) {
      console.log(`[queue] ${uid} at cap (${generating}), job ${jobId} stays pending`);
      return;
    }

    const taskId = await startSunoJob(job);
    if (taskId) {
      job.sunoTaskId = taskId;
      job.status = "generating";
      job.updatedAt = Date.now();
      await updateJob(client, job);
      await indexTaskId(client, taskId, jobId); // webhook reverse-lookup
      console.log(`[queue] job ${jobId} started immediately → Suno task ${taskId}`);
    } else {
      console.warn(`[queue] immediate start failed for ${jobId}, cron will retry`);
    }
  });

  return NextResponse.json({ jobId });
}
