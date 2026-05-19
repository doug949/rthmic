// GET /api/process-queue — Vercel Cron handler (runs every minute).
// For each user with queued jobs:
//   1. Poll all "generating" jobs → save to library if done
//   2. Start "pending" jobs up to a cap of MAX_CONCURRENT per user

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import {
  withRedisQueue, getUserJobIds, getJob, updateJob,
  removeJobFromUserList, USERS_KEY,
  userQueueKey,
} from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import type { SavedRhythm } from "@/app/api/library/route";
import type { TimedWord } from "@/app/types/pipeline";

export const maxDuration = 60;

const MAX_CONCURRENT = 5;
const BASE_URL = "https://api.sunoapi.org/api/v1";
const CALLBACK_URL = "https://rthmic.vercel.app/api/suno-webhook";

// ─── Suno helpers (mirrors poll-generation/route.ts logic) ───────────────────

type SunoClip = Record<string, unknown>;

function extractClips(node: unknown, depth = 0): SunoClip[] {
  if (depth > 4 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    if (node.length > 0) {
      const first = node[0] as Record<string, unknown>;
      if (first.audio_url || first.stream_audio_url || first.id) return node as SunoClip[];
    }
    for (const item of node) {
      const found = extractClips(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }
  const obj = node as Record<string, unknown>;
  const priorityKeys = ["clips", "data", "response", "songs", "results", "records"];
  for (const key of priorityKeys) {
    if (obj[key]) {
      const found = extractClips(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }
  for (const [key, val] of Object.entries(obj)) {
    if (!priorityKeys.includes(key) && Array.isArray(val) && val.length > 0) {
      const found = extractClips(val, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function getAudioUrl(clip: SunoClip): string | undefined {
  const candidates = [clip.stream_audio_url, clip.audio_url, clip.url, clip.mp3_url, clip.audioUrl, clip.streamUrl, clip.stream_url];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
}

const STILL_WAITING = new Set(["PENDING", "GENERATING", "IN_QUEUE", "QUEUED", "TEXT_SUCCESS", "RUNNING"]);

// ─── Library save (direct Redis write, mirrors /api/library POST save) ────────

async function saveToLibrary(
  client: ReturnType<typeof createClient>,
  userId: string,
  rhythm: SavedRhythm
): Promise<void> {
  const key = `lib:${userId}`;
  const raw = await client.get(key);
  const all: SavedRhythm[] = raw ? JSON.parse(raw) : [];
  all.unshift(rhythm);
  await client.set(key, JSON.stringify(all));
}

// ─── Fetch timed lyrics (best-effort, non-blocking) ──────────────────────────

async function fetchTimedLyrics(taskId: string, audioId: string): Promise<TimedWord[] | null> {
  try {
    const res = await fetch(
      `https://rthmic.vercel.app/api/timed-lyrics?taskId=${encodeURIComponent(taskId)}&audioId=${encodeURIComponent(audioId)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { timedWords?: TimedWord[] };
    return data.timedWords ?? null;
  } catch { return null; }
}

// ─── Poll a generating job ────────────────────────────────────────────────────

async function pollJob(
  client: ReturnType<typeof createClient>,
  job: QueueJob
): Promise<"still-waiting" | "saved" | "failed"> {
  if (!job.sunoTaskId) return "failed";

  const res = await fetch(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(job.sunoTaskId)}`,
    { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
  );
  if (!res.ok) return "still-waiting";

  const json = await res.json();
  const task = json.data;
  const rawStatus = (
    (typeof task === "object" && task !== null ? (task as Record<string, unknown>).status : null) ??
    json.status ?? ""
  ).toString().toUpperCase();

  if (rawStatus === "FAILED" || rawStatus === "GENERATE_AUDIO_FAILED" || rawStatus === "CREATE_TASK_FAILED") {
    job.status = "failed";
    await updateJob(client, job);
    return "failed";
  }

  const clips = extractClips(json);
  const playableClips = clips.filter((c) => getAudioUrl(c));
  if (playableClips.length === 0 || STILL_WAITING.has(rawStatus)) return "still-waiting";

  // Ready — save both clips to library
  const songs = [playableClips[0], playableClips[1] ?? playableClips[0]];
  const baseTitle = String(playableClips[0].title ?? job.title);

  for (let i = 0; i < songs.length; i++) {
    const clip = songs[i];
    const clipId = String(clip.id ?? "");
    const songId = `${clipId || "suno"}-${i}`;
    const title = i === 0 ? baseTitle : `${baseTitle} (Variation)`;
    const audioUrl = getAudioUrl(clip);

    const rhythm: SavedRhythm = {
      id: songId,
      title,
      pillar: job.pillar,
      audioUrl,
      lyrics: job.lyrics,
      sunoClipId: clipId || undefined,
      sunoTaskId: job.sunoTaskId,
      savedAt: Date.now(),
      status: "active",
      ...(job.note ? { note: job.note } : {}),
    };

    await saveToLibrary(client, job.userId, rhythm);

    // Best-effort timed lyrics (non-blocking)
    if (clipId && job.sunoTaskId) {
      fetchTimedLyrics(job.sunoTaskId, clipId).then(async (timedLyrics) => {
        if (!timedLyrics) return;
        try {
          const c2 = createClient({ url: process.env.REDIS_URL });
          await c2.connect();
          const key = `lib:${job.userId}`;
          const raw = await c2.get(key);
          const all: SavedRhythm[] = raw ? JSON.parse(raw) : [];
          const idx = all.findIndex((r) => r.id === songId);
          if (idx !== -1) {
            all[idx].timedLyrics = timedLyrics;
            await c2.set(key, JSON.stringify(all));
          }
          await c2.disconnect();
        } catch { /* non-critical */ }
      }).catch(() => {});
    }
  }

  job.status = "done";
  await updateJob(client, job);
  return "saved";
}

// ─── Start a pending job ──────────────────────────────────────────────────────

async function startJob(
  client: ReturnType<typeof createClient>,
  job: QueueJob
): Promise<void> {
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
      prompt: job.lyrics,
      style: job.genre,
      title: job.title,
      callBackUrl: CALLBACK_URL,
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
    console.error(`[queue] No taskId for ${job.jobId}: ${JSON.stringify(json).slice(0, 200)}`);
    job.status = "failed";
    await updateJob(client, job);
    return;
  }

  job.sunoTaskId = taskId;
  job.status = "generating";
  await updateJob(client, job);
  console.log(`[queue] Started job ${job.jobId} → Suno task ${taskId}`);
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

  // Poll generating jobs first
  for (const job of jobs.filter((j) => j.status === "generating")) {
    const result = await pollJob(client, job);
    if (result === "saved") { completed++; await removeJobFromUserList(client, userId, job.jobId); }
    if (result === "failed") { failed++; await removeJobFromUserList(client, userId, job.jobId); }
  }

  // Count still-generating after polling
  const refreshed = await getUserJobIds(client, userId);
  let generating = 0;
  for (const jobId of refreshed) {
    const j = await getJob(client, jobId);
    if (j?.status === "generating") generating++;
  }

  // Start pending jobs up to cap
  for (const job of jobs.filter((j) => j.status === "pending")) {
    if (generating >= MAX_CONCURRENT) break;
    await startJob(client, job);
    generating++;
    started++;
  }

  // Clean up user from global set if no active jobs remain
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
  // Vercel sets this header on all cron invocations
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const hasSecret = req.nextUrl.searchParams.get("secret") === process.env.CRON_SECRET;
  if (!isCron && !hasSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.SUNO_API_KEY || !process.env.REDIS_URL) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const summary: Record<string, unknown> = {};

  await withRedisQueue(async (client) => {
    const userIds = await client.sMembers(USERS_KEY);
    console.log(`[queue/cron] Processing ${userIds.length} users`);

    for (const userId of userIds) {
      try {
        const result = await processUserQueue(client, userId);
        summary[userId] = result;
        console.log(`[queue/cron] ${userId}: started=${result.started} completed=${result.completed} failed=${result.failed}`);
      } catch (err) {
        console.error(`[queue/cron] Error processing user ${userId}:`, err);
        summary[userId] = { error: String(err) };
      }
    }
  });

  return NextResponse.json({ ok: true, summary });
}
