// GET /api/process-queue — Vercel Cron handler (runs every minute).
// For each user with queued jobs:
//   1. Poll all "generating" jobs via our own /api/poll-generation (battle-tested)
//   2. Save completed songs to library as status "new"
//   3. Start "pending" jobs up to MAX_CONCURRENT per user
//   4. Mark any job generating > MAX_AGE_MS as failed (stuck guard)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import {
  withRedisQueue, getUserJobIds, getJob, updateJob,
  removeJobFromUserList, USERS_KEY, userQueueKey, indexTaskId,
} from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import type { Song } from "@/app/types/pipeline";
import { saveCompletedSongs } from "@/app/lib/generationCompletion";
import { extractSunoTaskId, isSunoCreditError, sunoStartError } from "@/app/lib/sunoResponse";
import { prepareSunoPrompt, trimToSunoLimit } from "@/app/lib/sunoLyrics";
import { writeLyricsFromBrief } from "@/app/services/llmService";

export const maxDuration = 60;

const MAX_CONCURRENT = 5;
const MAX_AGE_MS = 20 * 60 * 1000; // mark failed after 20 min stuck generating
const APP_URL = "https://rthmic.app";
const SUNO_BASE = "https://api.sunoapi.org/api/v1";

// ─── Poll one generating job via /api/poll-generation ────────────────────────

async function pollJob(
  client: ReturnType<typeof createClient>,
  job: QueueJob
): Promise<"still-waiting" | "saved" | "failed"> {
  if (!job.sunoTaskId) return "failed";

  // Staleness guard — if generating for too long, give up
  if (Date.now() - job.updatedAt > MAX_AGE_MS) {
    console.error(`[queue] Job ${job.jobId} timed out after ${Math.round((Date.now() - job.updatedAt) / 60000)} min`);
    job.status = "failed";
    job.failureReason = "Timed out while waiting for Suno";
    await updateJob(client, job);
    return "failed";
  }

  // Proxy through our own poll endpoint — reuses the same battle-tested parsing
  let pollData: { status: string; songs?: Song[] };
  try {
    const res = await fetch(
      `${APP_URL}/api/poll-generation?taskId=${encodeURIComponent(job.sunoTaskId)}&t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      console.warn(`[queue] poll-generation HTTP ${res.status} for job ${job.jobId}`);
      return "still-waiting";
    }
    pollData = await res.json();
  } catch (err) {
    console.warn(`[queue] poll-generation fetch error for job ${job.jobId}:`, err);
    return "still-waiting";
  }

  console.log(`[queue] job ${job.jobId} poll → ${pollData.status}`);

  if (pollData.status === "failed") {
    job.status = "failed";
    job.failureReason = "Suno generation failed";
    await updateJob(client, job);
    return "failed";
  }

  if (pollData.status !== "ready" || !pollData.songs?.length) return "still-waiting";

  const { saved, rhythms } = await saveCompletedSongs({
    client,
    userId: job.userId,
    jobId: job.jobId,
    pillar: job.pillar,
    lyrics: job.lyrics,
    genre: job.displayGenre ?? job.genre,
    songs: pollData.songs,
    note: job.note,
    experiment: job.experiment,
    tagHints: job.tagHints,
    menuSlug: job.menuSlug,
    rthmixId: job.rthmixId,
    rthmixTitle: job.rthmixTitle,
    rthmixType: job.rthmixType,
    rthmixTrackNumber: job.rthmixTrackNumber,
    rthmixTrackRole: job.rthmixTrackRole,
    rthmixUnlock: job.rthmixUnlock,
    rthmixAlbumArtPrompt: job.rthmixAlbumArtPrompt,
  });
  console.log(`[queue] saved ${saved}/${rhythms.length} rhythm(s) for user ${job.userId}${job.menuSlug ? ` menu ${job.menuSlug}` : ""}`);

  if (saved <= 0) {
    job.status = "failed";
    job.failureReason = "Generated but could not save to library";
    await updateJob(client, job);
    return "failed";
  }

  job.status = "done";
  await updateJob(client, job);
  return "saved";
}

// ─── Start a pending job via Suno API ────────────────────────────────────────

async function startJob(
  client: ReturnType<typeof createClient>,
  job: QueueJob
): Promise<void> {
  if (!job.lyrics?.trim()) {
    if (!job.transcript || !job.stateSummary) {
      job.status = "failed";
      job.failureReason = "Missing lyrics and interpretation brief";
      await updateJob(client, job);
      return;
    }

    try {
      console.log(`[queue] writing lyrics for job ${job.jobId}`);
      job.status = "writing";
      await updateJob(client, job);
      job.lyrics = trimToSunoLimit(await writeLyricsFromBrief({
        transcript: job.transcript,
        pillar: job.pillar,
        title: job.title,
        stateSummary: job.stateSummary,
      }));
      await updateJob(client, job);
    } catch (err) {
      console.error(`[queue] lyric writing failed for ${job.jobId}:`, err);
      job.status = "failed";
      job.failureReason = err instanceof Error ? err.message : "Lyric writing failed";
      await updateJob(client, job);
      return;
    }
  }

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
      prompt: prepareSunoPrompt(job.lyrics),
      style: job.genre,
      title: job.title,
      callBackUrl: `${APP_URL}/api/suno-webhook`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[queue] Suno start failed for ${job.jobId}: ${res.status} ${text}`);
    job.status = "failed";
    try {
      job.failureReason = sunoStartError(JSON.parse(text)) ?? `Suno start failed (${res.status})`;
    } catch {
      job.failureReason = isSunoCreditError(text)
        ? "Suno credits are empty. Top up the connected Suno account, then try again."
        : `Suno start failed (${res.status})`;
    }
    await updateJob(client, job);
    return;
  }

  const json = await res.json();
  const apiError = sunoStartError(json);
  if (apiError) {
    console.error(`[queue] Suno start rejected for ${job.jobId}: ${apiError} ${JSON.stringify(json).slice(0, 300)}`);
    job.status = "failed";
    job.failureReason = apiError;
    await updateJob(client, job);
    return;
  }

  const taskId = extractSunoTaskId(json);

  if (!taskId) {
    console.error(`[queue] No taskId for ${job.jobId}: ${JSON.stringify(json).slice(0, 300)}`);
    job.status = "failed";
    job.failureReason = "Suno returned no task ID";
    await updateJob(client, job);
    return;
  }

  job.sunoTaskId = taskId;
  job.status = "generating";
  job.updatedAt = Date.now();
  await updateJob(client, job);
  await indexTaskId(client, taskId, job.jobId); // webhook reverse-lookup
  console.log(`[queue] started job ${job.jobId} → Suno task ${taskId}`);
}

// ─── Process one user's queue ─────────────────────────────────────────────────

async function processUserQueue(
  client: ReturnType<typeof createClient>,
  userId: string
): Promise<{ started: number; completed: number; failed: number }> {
  const jobIds = await getUserJobIds(client, userId);
  const jobs: QueueJob[] = [];
  for (const jobId of jobIds) {
    const job = await getJob(client, jobId);
    if (job) jobs.push(job);
  }

  let started = 0, completed = 0, failed = 0;

  // 1. Poll all generating jobs
  for (const job of jobs.filter((j) => j.status === "generating")) {
    const result = await pollJob(client, job);
    if (result === "saved") { completed++; await removeJobFromUserList(client, userId, job.jobId); }
    if (result === "failed") failed++;
  }

  // 2. Count still-generating, start pending up to cap
  const afterPoll = await getUserJobIds(client, userId);
  let generating = 0;
  for (const jobId of afterPoll) {
    const j = await getJob(client, jobId);
    if (j?.status === "generating") generating++;
  }

  for (const job of jobs.filter((j) => j.status === "writing" && Date.now() - j.updatedAt > MAX_AGE_MS)) {
    console.warn(`[queue] resetting stale lyric-writing job ${job.jobId}`);
    job.status = "pending";
    await updateJob(client, job);
  }

  for (const job of jobs.filter((j) => j.status === "pending")) {
    if (generating >= MAX_CONCURRENT) break;
    await startJob(client, job);
    generating++;
    started++;
  }

  // 3. Clean up user from global set if no active jobs remain
  const remaining = await getUserJobIds(client, userId);
  let anyActive = false;
  for (const jobId of remaining) {
    const j = await getJob(client, jobId);
    if (j && (j.status === "pending" || j.status === "writing" || j.status === "generating")) { anyActive = true; break; }
  }
  if (!anyActive) {
    await client.sRem(USERS_KEY, userId);
  }

  return { started, completed, failed };
}

// ─── Cron entry point ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  // CRON_SECRET is auto-injected by Vercel; if unset (local dev) allow all.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    const isCron = auth === `Bearer ${cronSecret}`;
    const hasSecret = req.nextUrl.searchParams.get("secret") === cronSecret;
    if (!isCron && !hasSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (!process.env.SUNO_API_KEY || !process.env.REDIS_URL) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const summary: Record<string, unknown> = {};

  await withRedisQueue(async (client) => {
    const userIds = await client.sMembers(USERS_KEY);
    console.log(`[queue/cron] Processing ${userIds.length} user(s)`);

    for (const userId of userIds) {
      try {
        const result = await processUserQueue(client, userId);
        summary[userId] = result;
        console.log(`[queue/cron] ${userId} → started=${result.started} completed=${result.completed} failed=${result.failed}`);
      } catch (err) {
        console.error(`[queue/cron] Error for user ${userId}:`, err);
        summary[userId] = { error: String(err) };
      }
    }
  });

  return NextResponse.json({ ok: true, processed: Object.keys(summary).length, summary });
}
