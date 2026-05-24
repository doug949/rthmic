export const maxDuration = 30;

// Proxy audio through our server so iOS never hits Suno CDN directly.
// Fetches a fresh URL from Suno, then pipes the audio bytes back.
// Falls back to the stored audioUrl if the Suno refresh fails.

import { NextRequest, NextResponse } from "next/server";
import type { ShareEntry } from "@/app/api/share/route";
import type { SavedRhythm } from "@/app/types/library";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { libraryKey, menuKey, readSavedRhythms } from "@/app/lib/rhythmStorage";
import { getWasabiSignedUrl } from "@/app/lib/wasabiUpload";
import { MENU_CONFIGS } from "@/app/lib/menuConfigs";

const BASE_URL = "https://api.sunoapi.org/api/v1";

function getAudioUrl(clip: Record<string, unknown>): string | undefined {
  const candidates = [
    clip.audioUrl, clip.sourceStreamAudioUrl, clip.audio_url, clip.source_stream_audio_url,
    clip.url, clip.mp3_url, clip.streamAudioUrl, clip.stream_audio_url,
    clip.streamUrl, clip.stream_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
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

function inferSunoClipId(rhythm: SavedRhythm): string {
  if (rhythm.sunoClipId) return rhythm.sunoClipId;
  return rhythm.id.replace(/-\d+$/, "");
}

function clipMatches(clip: Record<string, unknown>, clipId: string): boolean {
  if ([clip.id, clip.audioId, clip.songId, clip.clipId].some((v) => String(v ?? "") === clipId)) return true;
  return Object.values(clip).some((v) => typeof v === "string" && v.includes(clipId));
}

async function getFreshUrl(rhythm: SavedRhythm): Promise<string | null> {
  if (!rhythm.sunoTaskId || !process.env.SUNO_API_KEY) return null;
  try {
    const res = await fetch(
      `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(rhythm.sunoTaskId)}`,
      { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const clips = extractClips(json);
    const clipId = inferSunoClipId(rhythm);
    const clip = clips.find((c) => clipMatches(c, clipId)) ?? clips[0];
    return clip ? (getAudioUrl(clip) ?? null) : null;
  } catch {
    return null;
  }
}

function isEmptyAudioResponse(response: Response): boolean {
  return response.headers.get("Content-Length") === "0";
}

export async function GET(request: NextRequest) {
  const rhythmId = request.nextUrl.searchParams.get("id");
  const token = request.nextUrl.searchParams.get("token");
  if (!rhythmId && !token) return new NextResponse("id or token required", { status: 400 });

  // Look up the rhythm in Redis
  let rhythm: SavedRhythm | null = null;
  if (REDIS_AVAILABLE) {
    try {
      rhythm = await withRedis(async (client) => {
        if (token) {
          const raw = await client.get(`shr:${token}`);
          const entry = raw ? (JSON.parse(raw) as ShareEntry) : null;
          return entry?.rhythm ?? null;
        }

        const uid = requireUserId(request);
        if (!uid) return null;

        const rhythms = await readSavedRhythms(client, libraryKey(uid));
        let found = rhythms.find((r) => r.id === rhythmId) ?? null;
        if (found) return found;

        for (const menu of MENU_CONFIGS) {
          const menuRhythms = await readSavedRhythms(client, menuKey(uid, menu.slug));
          found = menuRhythms.find((r) => r.id === rhythmId) ?? null;
          if (found) return found;
        }
        return null;
      });
    } catch { /* fall through */ }
  }

  if (!rhythm?.audioUrl && !rhythm?.audioKey) return new NextResponse("Not found", { status: 404 });

  // Prefer permanent Wasabi storage; fall back to fresh Suno URL or stored URL
  let audioUrl: string;
  if (rhythm.audioKey) {
    try {
      audioUrl = await getWasabiSignedUrl(rhythm.audioKey);
    } catch (e) {
      console.warn("[proxy-audio] Wasabi signed URL failed, falling back:", e);
      audioUrl = (await getFreshUrl(rhythm)) ?? rhythm.audioUrl ?? "";
    }
  } else {
    audioUrl = (await getFreshUrl(rhythm)) ?? rhythm.audioUrl ?? "";
  }

  // Pipe the audio through — pass through Range headers for seek support
  const range = request.headers.get("range");
  const cdnHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
    "Referer": "https://sunoapi.org/",
  };
  if (range) cdnHeaders["Range"] = range;
  let upstream = await fetch(audioUrl, { headers: cdnHeaders });

  // If Wasabi fetch failed (signed URL for non-existent object), fall back to Suno
  if (((!upstream.ok && upstream.status !== 206) || isEmptyAudioResponse(upstream)) && rhythm.audioKey) {
    console.warn(`[proxy-audio] Wasabi fetch failed (${upstream.status}) for ${rhythm.audioKey} — falling back to Suno`);
    const fallbackUrl = (await getFreshUrl(rhythm)) ?? rhythm.audioUrl;
    if (fallbackUrl) {
      upstream = await fetch(fallbackUrl, { headers: cdnHeaders });
    }
  }

  if ((!upstream.ok && upstream.status !== 206) || isEmptyAudioResponse(upstream)) {
    return new NextResponse("Audio fetch failed", { status: 502 });
  }

  if (!upstream.body) {
    return new NextResponse("Audio fetch failed", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  if (upstream.headers.has("Content-Length")) {
    headers.set("Content-Length", upstream.headers.get("Content-Length")!);
  }
  if (upstream.headers.has("Content-Range")) {
    headers.set("Content-Range", upstream.headers.get("Content-Range")!);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
