// POST /api/queue-generation
// Accepts a job, starts the Suno generation immediately (up to MAX_CONCURRENT),
// writes the job to Redis, and returns immediately.
// The cron at /api/process-queue handles polling for completion.

import { NextRequest, NextResponse } from "next/server";
import { withRedisQueue, getUserJobIds, getJob, pushJob, updateJob, indexTaskId } from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis, type RedisClient } from "@/app/lib/redis";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";
import { extractSunoTaskId, isSunoCreditError, sunoStartError } from "@/app/lib/sunoResponse";
import { applyVocalistPreference, buildSunoStyle } from "@/app/lib/sunoStyle";
import type { StyleChoice } from "@/app/services/llmService";
import type { PillarType } from "@/app/types/pipeline";

export const maxDuration = 30;

const MAX_CONCURRENT = 5;
const SUNO_CHAR_LIMIT = 5000;
const SUNO_BASE = "https://api.sunoapi.org/api/v1";
const APP_URL = "https://rthmic.app";

async function getVocalistPref(uid: string): Promise<"male" | "female" | "none"> {
  try {
    if (!REDIS_AVAILABLE) return "none";
    return await withRedis(async (client) => {
      const raw = await client.get(`settings:${uid}`);
      if (!raw) return "none";
      const s = JSON.parse(raw);
      return s.vocalist === "male" || s.vocalist === "female" ? s.vocalist : "none";
    });
  } catch { return "none"; }
}

async function countGenerating(client: RedisClient, userId: string): Promise<number> {
  const ids = await getUserJobIds(client, userId);
  let count = 0;
  for (const id of ids) {
    const j = await getJob(client, id);
    if (j?.status === "generating") count++;
  }
  return count;
}

async function startSunoJob(job: QueueJob): Promise<{ taskId: string | null; error?: string }> {
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
      try {
        const apiError = sunoStartError(JSON.parse(text));
        if (apiError) return { taskId: null, error: apiError };
      } catch { /* non-JSON response */ }
      if (isSunoCreditError(text)) {
        return { taskId: null, error: "Suno credits are empty. Top up the connected Suno account, then try again." };
      }
      return { taskId: null, error: `Suno start failed (${res.status})` };
    }
    const json = await res.json();
    const apiError = sunoStartError(json);
    if (apiError) {
      console.error(`[queue] Suno start rejected for ${job.jobId}: ${apiError} ${JSON.stringify(json).slice(0, 400)}`);
      return { taskId: null, error: apiError };
    }
    const taskId = extractSunoTaskId(json);
    if (!taskId) {
      console.error(`[queue] Suno start returned no taskId for ${job.jobId}: ${JSON.stringify(json).slice(0, 400)}`);
      return { taskId: null, error: "Suno returned no task ID" };
    }
    return { taskId };
  } catch (err) {
    console.error("[queue] Suno start error:", err);
    return { taskId: null, error: err instanceof Error ? err.message : "Suno start error" };
  }
}

export async function POST(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ error: "Queue not configured" }, { status: 500 });
  if (!process.env.SUNO_API_KEY) return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });

  const body = await req.json();
  const rawLyrics = typeof body.lyrics === "string" ? body.lyrics : "";
  const style = (body.style as StyleChoice) ?? "B";
  const rawGenre = typeof body.genre === "string" && body.genre.trim() ? body.genre.trim() : "Indie Electronic";
  const pillar = body.pillar as PillarType;
  const title = typeof body.title === "string" ? body.title.slice(0, 80) : "RTHM";
  const note = typeof body.note === "string" ? body.note : undefined;
  const menuSlug = typeof body.menuSlug === "string" ? body.menuSlug : undefined;
  const rthmixId = typeof body.rthmixId === "string" ? body.rthmixId : undefined;
  const rthmixTitle = typeof body.rthmixTitle === "string" ? body.rthmixTitle : undefined;
  const rthmixType = body.rthmixType === "memory" || body.rthmixType === "progression" ? body.rthmixType : undefined;
  const rthmixTrackNumber = typeof body.rthmixTrackNumber === "string" ? body.rthmixTrackNumber : undefined;
  const rthmixTrackRole =
    body.rthmixTrackRole === "ground-zero" ||
    body.rthmixTrackRole === "memory-hook" ||
    body.rthmixTrackRole === "unlock" ||
    body.rthmixTrackRole === "bonus"
      ? body.rthmixTrackRole
      : undefined;
  const rthmixUnlock = typeof body.rthmixUnlock === "string" ? body.rthmixUnlock : undefined;
  const rthmixAlbumArtPrompt = typeof body.rthmixAlbumArtPrompt === "string" ? body.rthmixAlbumArtPrompt : undefined;

  if (!rawLyrics.trim()) return NextResponse.json({ error: "lyrics required" }, { status: 400 });

  const vocalist = await getVocalistPref(uid);
  const genre = applyVocalistPreference(rawGenre, vocalist);
  const lyrics = toSunoPronunciation(rawLyrics.slice(0, SUNO_CHAR_LIMIT));
  const builtStyle = buildSunoStyle(genre);

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
    rthmixId,
    rthmixTitle,
    rthmixType,
    rthmixTrackNumber,
    rthmixTrackRole,
    rthmixUnlock,
    rthmixAlbumArtPrompt,
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

    const { taskId, error } = await startSunoJob(job);
    if (taskId) {
      job.sunoTaskId = taskId;
      job.status = "generating";
      job.updatedAt = Date.now();
      await updateJob(client, job);
      await indexTaskId(client, taskId, jobId); // webhook reverse-lookup
      console.log(`[queue] job ${jobId} started immediately → Suno task ${taskId}`);
    } else {
      if (error) job.failureReason = error;
      if (isSunoCreditError(error)) job.status = "failed";
      await updateJob(client, job);
      console.warn(`[queue] immediate start failed for ${jobId}${job.status === "failed" ? "" : ", cron will retry"}`);
    }
  });

  return NextResponse.json({ jobId });
}
