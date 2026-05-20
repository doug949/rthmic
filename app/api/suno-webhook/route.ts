// POST /api/suno-webhook — called by sunoapi.org when generation completes.
// Looks up the job by taskId, saves songs to the user's library, marks job done.
// The cron at /api/process-queue is a backup fallback for any missed webhooks.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import {
  jobIdForTaskId, getJob, updateJob, removeJobFromUserList,
  USERS_KEY, userQueueKey, withRedisQueue,
} from "@/app/lib/queueLib";
import type { SavedRhythm } from "@/app/api/library/route";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";

type SunoClip = Record<string, unknown>;

function getAudioUrl(clip: SunoClip): string | undefined {
  const candidates = [
    clip.stream_audio_url, clip.audio_url, clip.url,
    clip.mp3_url, clip.audioUrl, clip.streamUrl, clip.stream_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
}

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
  for (const key of ["clips", "data", "response", "songs", "results", "records"]) {
    if (obj[key]) {
      const found = extractClips(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function extractTaskId(body: Record<string, unknown>): string | undefined {
  // sunoapi.org may put the taskId in various places
  const candidates = [
    body.taskId,
    body.task_id,
    (body.data as Record<string, unknown>)?.taskId,
    (body.data as Record<string, unknown>)?.task_id,
    body.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
}

async function saveToLibrary(
  client: ReturnType<typeof createClient>,
  userId: string,
  rhythm: SavedRhythm
): Promise<void> {
  const key = `lib:${userId}`;
  const raw = await client.get(key);
  const all: SavedRhythm[] = raw ? JSON.parse(raw) : [];
  if (all.some((r) => r.id === rhythm.id)) return; // duplicate guard
  all.unshift(rhythm);
  await client.set(key, JSON.stringify(all));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
    console.log("[webhook] Suno callback:", JSON.stringify(body).slice(0, 600));
  } catch {
    return NextResponse.json({ ok: true }); // malformed — ack anyway
  }

  if (!process.env.REDIS_URL) return NextResponse.json({ ok: true });

  const taskId = extractTaskId(body);
  if (!taskId) {
    console.warn("[webhook] no taskId found in body");
    return NextResponse.json({ ok: true });
  }

  try {
    await withRedisQueue(async (client) => {
      const jobId = await jobIdForTaskId(client, taskId);
      if (!jobId) {
        console.warn(`[webhook] no job found for taskId ${taskId}`);
        return;
      }

      const job = await getJob(client, jobId);
      if (!job) {
        console.warn(`[webhook] jobId ${jobId} not found in Redis`);
        return;
      }
      if (job.status === "done") {
        console.log(`[webhook] job ${jobId} already done, skipping`);
        return;
      }

      // Extract clips from the webhook body
      const clips = extractClips(body).filter((c) => getAudioUrl(c));
      console.log(`[webhook] job ${jobId}: ${clips.length} playable clips`);

      if (clips.length === 0) {
        // Webhook fired before clips were ready (e.g. TEXT_SUCCESS phase) — cron will catch it
        console.log("[webhook] no playable clips yet, cron will poll");
        return;
      }

      // Save up to 2 clips to library, then upload audio to Wasabi
      const toSave = clips.slice(0, 2);
      for (let i = 0; i < toSave.length; i++) {
        const clip = toSave[i];
        const rawClipId = String(clip.id ?? "");
        const baseTitle = String(clip.title ?? job.title);
        const clipAudioUrl = getAudioUrl(clip)!;
        const rhythmId = `${rawClipId || "suno"}-${i}`;
        const rhythm: SavedRhythm = {
          id: rhythmId,
          title: i === 0 ? baseTitle : `${baseTitle} (Variation)`,
          pillar: job.pillar,
          audioUrl: clipAudioUrl,
          lyrics: job.lyrics,
          sunoClipId: rawClipId || undefined,
          sunoTaskId: taskId,
          savedAt: Date.now(),
          status: "new",
          ...(job.note ? { note: job.note } : {}),
        };
        await saveToLibrary(client, job.userId, rhythm);
        console.log(`[webhook] saved ${rhythm.id} ("${rhythm.title}") for user ${job.userId}`);

        // Upload audio to Wasabi — best-effort, updates Redis with audioKey if successful
        const wasabiKey = `rhythms/${job.userId}/${rhythmId}.mp3`;
        uploadAudioToWasabi(clipAudioUrl, wasabiKey)
          .then(async () => {
            try {
              const libKey = `lib:${job.userId}`;
              const raw2 = await client.get(libKey);
              if (!raw2) return;
              const all: SavedRhythm[] = JSON.parse(raw2);
              const idx = all.findIndex((r) => r.id === rhythmId);
              if (idx !== -1) {
                all[idx].audioKey = wasabiKey;
                await client.set(libKey, JSON.stringify(all));
                console.log(`[webhook] Wasabi upload done: ${wasabiKey}`);
              }
            } catch (e) {
              console.warn(`[webhook] Wasabi Redis patch failed for ${rhythmId}:`, e);
            }
          })
          .catch((e) => console.warn(`[webhook] Wasabi upload failed for ${rhythmId}:`, e));
      }

      // Mark job done and clean up
      job.status = "done";
      job.updatedAt = Date.now();
      await updateJob(client, job);
      await removeJobFromUserList(client, job.userId, jobId);

      // Clean up user from global set if no active jobs remain
      const remaining = await client.lRange(userQueueKey(job.userId), 0, -1);
      if (remaining.length === 0) {
        await client.sRem(USERS_KEY, job.userId);
        await client.del(userQueueKey(job.userId));
      }

      console.log(`[webhook] job ${jobId} completed and saved`);
    });
  } catch (err) {
    console.error("[webhook] error processing:", err);
    // Still return 200 so Suno doesn't retry infinitely
  }

  return NextResponse.json({ ok: true });
}
