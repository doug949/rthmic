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
import type { SavedRhythm } from "@/app/api/library/route";
import type { Song, TimedWord } from "@/app/types/pipeline";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";
import { tagsForSavedRhythm } from "@/app/lib/autoTags";

export const maxDuration = 60;

const MAX_CONCURRENT = 5;
const MAX_AGE_MS = 20 * 60 * 1000; // mark failed after 20 min stuck generating
const APP_URL = "https://rthmic.app";
const SUNO_BASE = "https://api.sunoapi.org/api/v1";

// ─── Library save (direct Redis, mirrors /api/library POST save) ──────────────

async function saveToLibrary(
  client: ReturnType<typeof createClient>,
  userId: string,
  rhythm: SavedRhythm
): Promise<void> {
  const key = `lib:${userId}`;
  const raw = await client.get(key);
  const all: SavedRhythm[] = raw ? JSON.parse(raw) : [];
  // Avoid duplicate if already saved (cron retry safety)
  if (all.some((r) => r.id === rhythm.id)) return;
  all.unshift(rhythm);
  await client.set(key, JSON.stringify(all));
}

async function saveToMenu(
  client: ReturnType<typeof createClient>,
  userId: string,
  slug: string,
  rhythms: SavedRhythm[]
): Promise<void> {
  const key = `menu:${userId}:${slug}`;
  const raw = await client.get(key);
  const existing: SavedRhythm[] = raw ? JSON.parse(raw) : [];
  const existingIds = new Set(existing.map((r) => r.id));
  const fresh = rhythms.filter((r) => !existingIds.has(r.id));
  if (!fresh.length) return;
  await client.set(key, JSON.stringify([...fresh, ...existing]));
}

// ─── Attach timed lyrics to an already-saved rhythm (best-effort) ────────────

async function attachTimedLyrics(userId: string, songId: string, taskId: string, audioId: string, menuSlug?: string) {
  try {
    const res = await fetch(`${APP_URL}/api/timed-lyrics?taskId=${encodeURIComponent(taskId)}&audioId=${encodeURIComponent(audioId)}`);
    if (!res.ok) return;
    const data = await res.json() as { timedWords?: TimedWord[] };
    if (!data.timedWords?.length) return;

    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    try {
      const key = menuSlug ? `menu:${userId}:${menuSlug}` : `lib:${userId}`;
      const raw = await client.get(key);
      const all: SavedRhythm[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex((r) => r.id === songId);
      if (idx !== -1) {
        all[idx].timedLyrics = data.timedWords;
        await client.set(key, JSON.stringify(all));
      }
    } finally { await client.disconnect(); }
  } catch { /* non-critical */ }
}

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
    await updateJob(client, job);
    return "failed";
  }

  if (pollData.status !== "ready" || !pollData.songs?.length) return "still-waiting";

  // Save both songs. Because these are shown as playable immediately,
  // wait for the permanent audio copy where possible instead of saving first
  // and patching audioKey in a later background task.
  const pairId = pollData.songs.length > 1 ? job.jobId : undefined;
  const menuRhythms: SavedRhythm[] = [];
  for (let i = 0; i < pollData.songs.length; i++) {
    const song = pollData.songs[i];
    const wasabiKey = `rhythms/${job.userId}/${song.id}.mp3`;
    let audioKey: string | undefined;

    if (song.audioUrl) {
      try {
        audioKey = await uploadAudioToWasabi(song.audioUrl, wasabiKey);
        console.log(`[queue] Wasabi upload done before save: ${wasabiKey}`);
      } catch (e) {
        console.warn(`[queue] Wasabi upload failed before save for ${song.id}, saving Suno fallback:`, e);
      }
    }

    const rhythm: SavedRhythm = {
      id: song.id,
      title: song.title,
      pillar: job.pillar,
      audioUrl: song.audioUrl,
      lyrics: job.lyrics,
      sunoClipId: song.sunoClipId,
      sunoTaskId: song.sunoTaskId,
      savedAt: Date.now(),
      status: job.menuSlug ? "active" : "new",
      ...(pairId ? {
        pairId,
        side: (i === 0 ? "A" : "B") as "A" | "B",
        alternateId: pollData.songs[i === 0 ? 1 : 0]?.id,
      } : {}),
      ...(audioKey ? { audioKey } : {}),
      ...(job.note ? { note: job.note } : {}),
    };
    if (!job.menuSlug) rhythm.tags = tagsForSavedRhythm(rhythm);
    if (job.menuSlug) {
      menuRhythms.push(rhythm);
    } else {
      await saveToLibrary(client, job.userId, rhythm);
      console.log(`[queue] saved ${rhythm.id} (${rhythm.title}) for user ${job.userId}`);
    }

    // Best-effort timed lyrics — fire and forget
    if (song.sunoClipId && song.sunoTaskId) {
      attachTimedLyrics(job.userId, song.id, song.sunoTaskId, song.sunoClipId, job.menuSlug).catch(() => {});
    }
  }
  if (job.menuSlug && menuRhythms.length) {
    await saveToMenu(client, job.userId, job.menuSlug, menuRhythms);
    console.log(`[queue] saved menu ${job.menuSlug} (${menuRhythms.length} songs) for user ${job.userId}`);
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
    console.error(`[queue] Suno start failed for ${job.jobId}: ${res.status} ${text}`);
    job.status = "failed";
    await updateJob(client, job);
    return;
  }

  const json = await res.json();
  const taskId: string =
    json.data?.taskId ??
    (typeof json.data === "string" ? json.data : undefined) ??
    json.taskId;

  if (!taskId) {
    console.error(`[queue] No taskId for ${job.jobId}: ${JSON.stringify(json).slice(0, 300)}`);
    job.status = "failed";
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
    if (result === "failed") { failed++; await removeJobFromUserList(client, userId, job.jobId); }
  }

  // 2. Count still-generating, start pending up to cap
  const afterPoll = await getUserJobIds(client, userId);
  let generating = 0;
  for (const jobId of afterPoll) {
    const j = await getJob(client, jobId);
    if (j?.status === "generating") generating++;
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
    if (j && (j.status === "pending" || j.status === "generating")) { anyActive = true; break; }
  }
  if (!anyActive) {
    await client.sRem(USERS_KEY, userId);
    await client.del(userQueueKey(userId));
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
