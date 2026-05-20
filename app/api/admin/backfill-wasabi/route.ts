// GET /api/admin/backfill-wasabi?batch=5
// Paginated backfill — processes `batch` tracks per call (default 5).
// Returns `done: true` when nothing is left to upload.
// Call repeatedly until done:true.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";

const SUNO_BASE = "https://api.sunoapi.org/api/v1";

async function getFreshAudioUrl(rhythm: SavedRhythm): Promise<string | null> {
  if (!rhythm.sunoTaskId || !process.env.SUNO_API_KEY) return null;
  try {
    const res = await fetch(
      `${SUNO_BASE}/generate/record-info?taskId=${encodeURIComponent(rhythm.sunoTaskId)}`,
      { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    // Walk the response tree to find clips
    const clips: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const obj = node as Record<string, unknown>;
      if (obj.audio_url || obj.stream_audio_url || obj.audioUrl || obj.url || obj.mp3_url) { clips.push(obj); return; }
      Object.values(obj).forEach(walk);
    };
    walk(json);
    const [clipId] = rhythm.id.split("-");
    const clip = clips.find((c) => String(c.id ?? "") === clipId) ?? clips[0];
    if (!clip) return null;
    const url = [clip.stream_audio_url, clip.audio_url, clip.audioUrl, clip.url, clip.mp3_url, clip.streamUrl, clip.stream_url]
      .find((u) => typeof u === "string" && (u as string).startsWith("http"));
    return (url as string) ?? null;
  } catch {
    return null;
  }
}

export const maxDuration = 60;

function requireAuth(req: NextRequest): boolean {
  const session = req.cookies.get("rthmic_session");
  return session?.value === process.env.RTHMIC_SESSION_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.REDIS_URL || !process.env.WASABI_ACCESS_KEY_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const batchSize = Math.min(
    parseInt(req.nextUrl.searchParams.get("batch") ?? "5", 10) || 5,
    20 // hard cap — more than 20 uploads will always timeout
  );

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const uploaded: string[] = [];
  const failed: { id: string; title: string; reason: string }[] = [];
  let processed = 0;
  let remaining = 0;

  try {
    const libKeys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "lib:*", COUNT: 100 })) {
      if (typeof key === "string") libKeys.push(key);
      else libKeys.push(...(key as string[]));
    }

    for (const libKey of libKeys) {
      const userId = libKey.slice(4);
      const raw = await client.get(libKey);
      if (!raw) continue;

      const all: SavedRhythm[] = JSON.parse(raw);
      let dirty = false;

      for (const rhythm of all) {
        if (rhythm.status === "deleted" || rhythm.audioKey || !rhythm.audioUrl) continue;

        remaining++;

        if (processed >= batchSize) continue; // count but don't upload yet

        const wasabiKey = `rhythms/${userId}/${rhythm.id}.mp3`;
        try {
          // Try stored URL first; if it 404s fetch a fresh one from Suno API
          let sourceUrl = rhythm.audioUrl;
          try {
            await uploadAudioToWasabi(sourceUrl, wasabiKey);
          } catch {
            console.warn(`[backfill] stored URL failed for ${rhythm.id}, trying Suno API refresh`);
            const freshUrl = await getFreshAudioUrl(rhythm);
            if (!freshUrl) throw new Error("Suno API returned no URL");
            sourceUrl = freshUrl;
            await uploadAudioToWasabi(sourceUrl, wasabiKey);
          }
          rhythm.audioKey = wasabiKey;
          dirty = true;
          uploaded.push(rhythm.title);
          processed++;
          remaining--;
          console.log(`[backfill] uploaded ${wasabiKey}`);
        } catch (e) {
          failed.push({ id: rhythm.id, title: rhythm.title, reason: String(e) });
          processed++;
          console.warn(`[backfill] failed ${rhythm.id}:`, e);
        }
      }

      if (dirty) await client.set(libKey, JSON.stringify(all));
    }
  } finally {
    await client.disconnect();
  }

  return NextResponse.json({
    done: remaining === 0,
    uploaded: uploaded.length,
    failed: failed.length,
    remaining,
    uploadedTracks: uploaded,
    failedTracks: failed,
  });
}
