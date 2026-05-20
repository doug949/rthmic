import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";

const SUNO_BASE = "https://api.sunoapi.org/api/v1";

export const maxDuration = 30;

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

function extractClips(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || !node || typeof node !== "object") return [];
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

function collectUrls(node: unknown, prefix = ""): { path: string; url: string }[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((item, idx) => collectUrls(item, `${prefix}[${idx}]`));
  }

  const urls: { path: string; url: string }[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" && value.startsWith("http")) {
      urls.push({ path, url: value });
    } else {
      urls.push(...collectUrls(value, path));
    }
  }
  return urls;
}

function describeShape(node: unknown, depth = 0): unknown {
  if (depth > 3 || !node || typeof node !== "object") return typeof node;
  if (Array.isArray(node)) {
    return {
      type: "array",
      length: node.length,
      first: node.length > 0 ? describeShape(node[0], depth + 1) : null,
    };
  }
  const obj = node as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(obj).slice(0, 20).map(([key, value]) => [
      key,
      value && typeof value === "object" ? describeShape(value, depth + 1) : typeof value,
    ])
  );
}

function inferSunoClipId(rhythm: SavedRhythm): string {
  if (rhythm.sunoClipId) return rhythm.sunoClipId;
  return rhythm.id.replace(/-\d+$/, "");
}

function safeUrlLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return rawUrl.slice(0, 120);
  }
}

async function probeUrl(rawUrl: string) {
  try {
    const res = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        "Referer": "https://sunoapi.org/",
        "Range": "bytes=0-1023",
      },
    });
    const body = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get("Content-Type"),
      contentLength: res.headers.get("Content-Length"),
      contentRange: res.headers.get("Content-Range"),
      bytes: body.byteLength,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

export async function GET(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL || !process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const rhythmId = req.nextUrl.searchParams.get("id");
  if (!rhythmId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  try {
    const raw = await client.get(`lib:${uid}`);
    const rhythms: SavedRhythm[] = raw ? JSON.parse(raw) : [];
    const rhythm = rhythms.find((r) => r.id === rhythmId);
    if (!rhythm) return NextResponse.json({ error: "Rhythm not found" }, { status: 404 });
    if (!rhythm.sunoTaskId) return NextResponse.json({ error: "Rhythm has no sunoTaskId" }, { status: 400 });

    const sunoRes = await fetch(
      `${SUNO_BASE}/generate/record-info?taskId=${encodeURIComponent(rhythm.sunoTaskId)}`,
      { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
    );
    if (!sunoRes.ok) {
      return NextResponse.json({ error: `Suno error ${sunoRes.status}` }, { status: 502 });
    }

    const json = await sunoRes.json();
    const clips = extractClips(json);
    const clipId = inferSunoClipId(rhythm);
    const clip = clips.find((c) => String(c.id ?? "") === clipId) ?? null;
    const allResponseUrls = [...new Map(collectUrls(json).map((u) => [u.url, u])).values()];
    const responseUrlProbes = await Promise.all(allResponseUrls.map(async (entry) => ({
      path: entry.path,
      label: safeUrlLabel(entry.url),
      ...(await probeUrl(entry.url)),
    })));
    if (!clip) {
      return NextResponse.json({
        error: "Matching clip not found",
        clipId,
        clipsFound: clips.length,
        responseShape: describeShape(json),
        responseUrlProbes,
      }, { status: 404 });
    }

    const urls = collectUrls(clip);
    const uniqueUrls = [...new Map(urls.map((u) => [u.url, u])).values()];
    const probes = await Promise.all(uniqueUrls.map(async (entry) => ({
      path: entry.path,
      label: safeUrlLabel(entry.url),
      ...(await probeUrl(entry.url)),
    })));

    return NextResponse.json({
      rhythm: {
        id: rhythm.id,
        title: rhythm.title,
        savedAt: rhythm.savedAt,
        audioKey: rhythm.audioKey,
        storedAudioLabel: rhythm.audioUrl ? safeUrlLabel(rhythm.audioUrl) : null,
        sunoTaskId: rhythm.sunoTaskId,
        sunoClipId: rhythm.sunoClipId,
      },
      clipId,
      clipsFound: clips.length,
      urlProbes: probes,
    }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    await client.disconnect();
  }
}
