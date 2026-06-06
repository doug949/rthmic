// POST /api/suno-webhook — called by sunoapi.org when generation completes.
// Looks up the job by taskId, saves songs to the user's library, marks job done.
// The cron at /api/process-queue is a backup fallback for any missed webhooks.

import { NextRequest, NextResponse } from "next/server";
import {
  jobIdForTaskId, getJob, updateJob, removeJobFromUserList,
  USERS_KEY, userQueueKey, withRedisQueue,
} from "@/app/lib/queueLib";
import type { Song } from "@/app/types/pipeline";
import { saveCompletedSongs } from "@/app/lib/generationCompletion";

export const maxDuration = 60;

type SunoClip = Record<string, unknown>;

function getAudioUrl(clip: SunoClip): string | undefined {
  const candidates = [
    clip.audioUrl, clip.sourceStreamAudioUrl, clip.audio_url, clip.source_stream_audio_url,
    clip.url, clip.mp3_url, clip.streamAudioUrl, clip.stream_audio_url,
    clip.streamUrl, clip.stream_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
}

async function probePlayableAudio(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        "Referer": "https://sunoapi.org/",
        "Range": "bytes=0-1023",
      },
    });
    if (!res.ok && res.status !== 206) return false;
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.startsWith("audio/")) return false;
    const body = await res.arrayBuffer();
    return body.byteLength > 0;
  } catch {
    return false;
  }
}

function extractClips(node: unknown, depth = 0): SunoClip[] {
  if (depth > 4 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    if (node.length > 0) {
      const first = node[0] as Record<string, unknown>;
      if (
        first.audioUrl || first.sourceStreamAudioUrl || first.audio_url ||
        first.source_stream_audio_url || first.streamAudioUrl || first.stream_audio_url || first.id
      ) return node as SunoClip[];
    }
    for (const item of node) {
      const found = extractClips(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }
  const obj = node as Record<string, unknown>;
  for (const key of ["clips", "sunoData", "data", "response", "songs", "results", "records"]) {
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

      // Extract clips from the webhook body and byte-test their audio before
      // making them visible. Some Suno callbacks include URLs before the CDN
      // object is actually readable.
      const clips = extractClips(body);
      const playable: Array<{ clip: SunoClip; audioUrl: string }> = [];
      for (const clip of clips) {
        const audioUrl = getAudioUrl(clip);
        if (!audioUrl) continue;
        if (await probePlayableAudio(audioUrl)) playable.push({ clip, audioUrl });
        if (playable.length >= 2) break;
      }
      console.log(`[webhook] job ${jobId}: ${clips.length} clips, ${playable.length} byte-tested playable`);

      if (playable.length === 0) {
        // Webhook fired before audio was readable — cron will catch it
        console.log("[webhook] no playable clips yet, cron will poll");
        return;
      }

      const songs: Song[] = playable.slice(0, 2).map(({ clip, audioUrl }, i) => {
        const rawClipId = String(clip.id ?? "");
        const baseTitle = String(clip.title ?? job.title);
        return {
          id: `${rawClipId || "suno"}-${i}`,
          title: i === 0 ? baseTitle : `${baseTitle} (Variation)`,
          audioUrl,
          sunoClipId: rawClipId || undefined,
          sunoTaskId: taskId,
        };
      });

      const { saved, rhythms } = await saveCompletedSongs({
        client,
        userId: job.userId,
        jobId,
        pillar: job.pillar,
        lyrics: job.lyrics,
        songs,
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
      console.log(`[webhook] saved ${saved}/${rhythms.length} rhythm(s) for user ${job.userId}${job.menuSlug ? ` menu ${job.menuSlug}` : ""}`);

      if (saved <= 0) {
        job.status = "failed";
        job.failureReason = "Generated but could not save to library";
        await updateJob(client, job);
        console.warn(`[webhook] job ${jobId} generated but saved zero rhythms`);
        return;
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
