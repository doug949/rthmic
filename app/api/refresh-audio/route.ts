// Fetch a fresh audio URL from Suno for a stored rhythm whose CDN URL has expired.
// Also updates the stored audioUrl in Redis so the next play is instant.

import { NextRequest, NextResponse } from "next/server";
import type { SavedRhythm } from "@/app/types/library";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { archiveKey, libraryKey, readSavedRhythms, writeSavedRhythms } from "@/app/lib/rhythmStorage";

const BASE_URL = "https://api.sunoapi.org/api/v1";

function getAudioUrl(clip: Record<string, unknown>): string | undefined {
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
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return undefined;
}

function extractClips(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    const first = node[0] as Record<string, unknown> | undefined;
    if (first && (
      first.audioUrl || first.sourceStreamAudioUrl || first.audio_url ||
      first.source_stream_audio_url || first.streamAudioUrl || first.stream_audio_url || first.id
    )) return node as Record<string, unknown>[];
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

function inferSunoClipId(rhythmId: string, rhythms: SavedRhythm[]): string {
  const rhythm = rhythms.find((r) => r.id === rhythmId);
  if (rhythm?.sunoClipId) return rhythm.sunoClipId;
  return rhythmId.replace(/-\d+$/, "");
}

function clipMatches(clip: Record<string, unknown>, clipId: string): boolean {
  if ([clip.id, clip.audioId, clip.songId, clip.clipId].some((v) => String(v ?? "") === clipId)) return true;
  return Object.values(clip).some((v) => typeof v === "string" && v.includes(clipId));
}

export async function GET(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get("taskId");
  const rhythmId = request.nextUrl.searchParams.get("id");
  if (!taskId || !rhythmId) return NextResponse.json({ error: "taskId and id required" }, { status: 400 });
  if (!process.env.SUNO_API_KEY) return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });

  const res = await fetch(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
  );
  if (!res.ok) return NextResponse.json({ error: `Suno error ${res.status}` }, { status: 502 });

  const json = await res.json();
  const clips = extractClips(json);
  if (clips.length === 0) return NextResponse.json({ error: "No clips found" }, { status: 404 });

  let rhythms: SavedRhythm[] = [];
  let storageKey = libraryKey(uid);
  if (REDIS_AVAILABLE) {
    try {
      rhythms = await withRedis(async (client) => {
        const active = await readSavedRhythms(client, libraryKey(uid));
        if (active.some((rhythm) => rhythm.id === rhythmId)) return active;
        storageKey = archiveKey(uid);
        return readSavedRhythms(client, storageKey);
      });
    } catch (err) {
      console.warn("[refresh-audio] Redis lookup failed:", err);
    }
  }

  const clipId = inferSunoClipId(rhythmId, rhythms);
  const clip = clips.find((c) => clipMatches(c, clipId)) ?? clips[0];
  const freshUrl = getAudioUrl(clip);
  if (!freshUrl) return NextResponse.json({ error: "No audio URL in clip" }, { status: 404 });

  // Persist the fresh URL back to Redis so next play is instant
  if (REDIS_AVAILABLE && rhythms.length > 0) {
    try {
      await withRedis(async (client) => {
        const updated = rhythms.map((r) =>
          r.id === rhythmId ? { ...r, audioUrl: freshUrl } : r
        );
        await writeSavedRhythms(client, storageKey, updated);
      });
    } catch (err) {
      console.warn("[refresh-audio] Redis update failed:", err);
    }
  }

  return NextResponse.json({ url: freshUrl });
}
