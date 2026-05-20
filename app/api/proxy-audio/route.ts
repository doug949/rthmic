export const maxDuration = 30;

// Proxy audio through our server so iOS never hits Suno CDN directly.
// Fetches a fresh URL from Suno, then pipes the audio bytes back.
// Falls back to the stored audioUrl if the Suno refresh fails.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";
import { getWasabiSignedUrl } from "@/app/lib/wasabiUpload";

const BASE_URL = "https://api.sunoapi.org/api/v1";

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

function getAudioUrl(clip: Record<string, unknown>): string | undefined {
  const candidates = [
    clip.stream_audio_url, clip.audio_url, clip.url,
    clip.mp3_url, clip.audioUrl, clip.streamUrl, clip.stream_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
}

function extractClips(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    const first = node[0] as Record<string, unknown> | undefined;
    if (first && (first.audio_url || first.stream_audio_url || first.id)) return node as Record<string, unknown>[];
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
    const [clipId] = rhythm.id.split("-");
    const clip = clips.find((c) => String(c.id ?? "") === clipId) ?? clips[0];
    return clip ? (getAudioUrl(clip) ?? null) : null;
  } catch {
    return null;
  }
}

function isEmptyAudioResponse(response: Response): boolean {
  return response.headers.get("Content-Length") === "0";
}

export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return new NextResponse("Unauthorized", { status: 401 });

  const rhythmId = request.nextUrl.searchParams.get("id");
  if (!rhythmId) return new NextResponse("id required", { status: 400 });

  // Look up the rhythm in Redis
  let rhythm: SavedRhythm | null = null;
  if (process.env.REDIS_URL) {
    try {
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      const data = await client.get(`lib:${uid}`);
      if (data) {
        const rhythms: SavedRhythm[] = JSON.parse(data);
        rhythm = rhythms.find((r) => r.id === rhythmId) ?? null;
      }
      await client.disconnect();
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

  const audioBytes = await upstream.arrayBuffer();
  if (audioBytes.byteLength === 0) {
    return new NextResponse("Audio fetch failed", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(audioBytes.byteLength),
  });
  if (upstream.headers.has("Content-Range")) {
    headers.set("Content-Range", upstream.headers.get("Content-Range")!);
  }

  return new NextResponse(audioBytes, {
    status: upstream.status,
    headers,
  });
}
