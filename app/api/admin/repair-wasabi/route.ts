// GET /api/admin/repair-wasabi?batch=10
// Repairs tracks whose Redis audioKey points at a missing or zero-byte Wasabi object.

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";

const BUCKET = "rthm-audio";
const SUNO_BASE = "https://api.sunoapi.org/api/v1";

export const maxDuration = 60;

type RepairFailure = { id: string; title: string; key?: string; reason: string };
type RepairItem = { id: string; title: string; key: string; oldSize: number | null; source: string };

function requireAuth(req: NextRequest): boolean {
  const session = req.cookies.get("rthmic_session");
  return session?.value === process.env.RTHMIC_SESSION_TOKEN;
}

function makeS3(): S3Client {
  return new S3Client({
    region: "eu-west-1",
    endpoint: "https://s3.eu-west-1.wasabisys.com",
    credentials: {
      accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
      secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

async function getObjectSize(s3: S3Client, key: string): Promise<number | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

function clipMatches(clip: Record<string, unknown>, clipId: string): boolean {
  if ([clip.id, clip.audioId, clip.songId, clip.clipId].some((v) => String(v ?? "") === clipId)) return true;
  return Object.values(clip).some((v) => typeof v === "string" && v.includes(clipId));
}

function collectClips(node: unknown): Record<string, unknown>[] {
  const clips: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (
      obj.audioUrl || obj.sourceStreamAudioUrl || obj.audio_url ||
      obj.source_stream_audio_url || obj.streamAudioUrl || obj.stream_audio_url ||
      obj.url || obj.mp3_url
    ) {
      clips.push(obj);
      return;
    }
    Object.values(obj).forEach(walk);
  };
  walk(node);
  return clips;
}

function audioUrlCandidates(clip: Record<string, unknown>): string[] {
  const candidates = [
    clip.audioUrl,
    clip.sourceStreamAudioUrl,
    clip.audio_url,
    clip.source_stream_audio_url,
    clip.url,
    clip.mp3_url,
    clip.streamAudioUrl,
    clip.stream_audio_url,
    clip.streamUrl,
    clip.stream_url,
  ];
  return candidates.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
}

async function isPlayableAudio(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        "Referer": "https://sunoapi.org/",
        "Range": "bytes=0-1023",
      },
    });
    if (!res.ok && res.status !== 206) return false;
    if (!(res.headers.get("Content-Type") ?? "").startsWith("audio/")) return false;
    return (await res.arrayBuffer()).byteLength > 0;
  } catch {
    return false;
  }
}

async function getFreshAudioUrl(rhythm: SavedRhythm): Promise<{ url: string; source: string } | null> {
  if (!rhythm.sunoTaskId || !process.env.SUNO_API_KEY) return null;

  const res = await fetch(
    `${SUNO_BASE}/generate/record-info?taskId=${encodeURIComponent(rhythm.sunoTaskId)}`,
    { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Suno record-info ${res.status}`);

  const json = await res.json();
  const clipId = rhythm.sunoClipId ?? rhythm.id.replace(/-\d+$/, "");
  const clips = collectClips(json);
  const clip = clips.find((c) => clipMatches(c, clipId)) ?? null;
  if (!clip) throw new Error(`matching Suno clip not found (${clipId}); clips=${clips.length}`);

  for (const url of audioUrlCandidates(clip)) {
    if (await isPlayableAudio(url)) {
      const source = new URL(url).hostname;
      return { url, source };
    }
  }

  throw new Error(`no playable Suno audio URL for ${clipId}`);
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.REDIS_URL || !process.env.WASABI_ACCESS_KEY_ID || !process.env.WASABI_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const batchSize = Math.min(parseInt(req.nextUrl.searchParams.get("batch") ?? "10", 10) || 10, 20);
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const s3 = makeS3();
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const repaired: RepairItem[] = [];
  const failed: RepairFailure[] = [];
  const badRemaining: RepairFailure[] = [];
  let checked = 0;
  let healthy = 0;
  let badTotal = 0;
  let processed = 0;

  try {
    const libKeys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "lib:*", COUNT: 100 })) {
      if (typeof key === "string") libKeys.push(key);
      else libKeys.push(...(key as string[]));
    }

    for (const libKey of libKeys) {
      const raw = await client.get(libKey);
      if (!raw) continue;
      const rhythms: SavedRhythm[] = JSON.parse(raw);

      for (const rhythm of rhythms) {
        if (rhythm.status === "deleted" || !rhythm.audioKey) continue;
        checked++;

        const size = await getObjectSize(s3, rhythm.audioKey);
        if (size && size > 0) {
          healthy++;
          continue;
        }

        badTotal++;
        if (processed >= batchSize) {
          badRemaining.push({ id: rhythm.id, title: rhythm.title, key: rhythm.audioKey, reason: size === null ? "missing" : "zero-byte" });
          continue;
        }

        processed++;
        try {
          const fresh = await getFreshAudioUrl(rhythm);
          if (!fresh) throw new Error("no fresh Suno URL");
          if (!dryRun) await uploadAudioToWasabi(fresh.url, rhythm.audioKey);
          repaired.push({
            id: rhythm.id,
            title: rhythm.title,
            key: rhythm.audioKey,
            oldSize: size,
            source: fresh.source,
          });
        } catch (err) {
          failed.push({
            id: rhythm.id,
            title: rhythm.title,
            key: rhythm.audioKey,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } finally {
    await client.disconnect();
  }

  return NextResponse.json({
    done: badRemaining.length === 0,
    dryRun,
    checked,
    healthy,
    badTotal,
    processed,
    repaired: repaired.length,
    failed: failed.length,
    remaining: badRemaining.length,
    repairedTracks: repaired,
    failedTracks: failed,
    remainingTracks: badRemaining.slice(0, 50),
  }, { headers: { "Cache-Control": "no-store" } });
}
