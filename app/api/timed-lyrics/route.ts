// /api/timed-lyrics — fetch synchronized lyric timing from sunoapi.org.
//
// sunoapi.org wraps Suno's API; Suno clips carry a `lyric_sections` (or
// equivalent) field that maps each lyric line to a millisecond timestamp
// window.  This endpoint fetches the full clip payload, tries several known
// field paths, and returns whatever it finds.
//
// GET  /api/timed-lyrics?clipId=<sunoClipId>
// POST /api/timed-lyrics  { clipId }           ← library update shortcut
//
// The response always includes `clipKeys` (top-level clip fields) and
// `rawSnippet` so callers can inspect the shape even when no timing is found.

import { NextRequest, NextResponse } from "next/server";
import type { TimedSegment } from "@/app/types/pipeline";

const BASE_URL = "https://api.sunoapi.org/api/v1";
export const maxDuration = 12;

// ─── Field-path extraction ────────────────────────────────────────────────────
//
// Suno's timed-lyric data has appeared under several field names across
// different API versions.  Try them all in priority order.

function extractTimedLyrics(clip: Record<string, unknown>): TimedSegment[] | null {
  const meta = clip.metadata as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    clip.lyric_sections,
    clip.lyricSections,
    clip.lyric_groups,
    clip.lyricGroups,
    clip.sections,
    clip.lyrics_segments,
    clip.timed_lyrics,
    meta?.lyric_sections,
    meta?.lyricSections,
    meta?.lyric_groups,
    meta?.sections,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;
    const parsed = parseSegments(candidate as Record<string, unknown>[]);
    if (parsed && parsed.length > 0) return parsed;
  }

  return null;
}

function parseSegments(raw: Record<string, unknown>[]): TimedSegment[] | null {
  const out: TimedSegment[] = [];

  for (const s of raw) {
    // Normalise startMs — may arrive as startMs, start_ms, or start (seconds)
    const startMs =
      typeof s.startMs    === "number" ? s.startMs :
      typeof s.start_ms   === "number" ? s.start_ms :
      typeof s.start      === "number" ? Math.round(s.start * 1000) :
      null;

    const endMs =
      typeof s.endMs      === "number" ? s.endMs :
      typeof s.end_ms     === "number" ? s.end_ms :
      typeof s.end        === "number" ? Math.round(s.end * 1000) :
      null;

    const text = String(s.text ?? s.lyric ?? s.content ?? s.line ?? "").trim();

    if (startMs === null || endMs === null || !text) continue;
    out.push({ startMs, endMs, text });
  }

  return out.length ? out : null;
}

// ─── Clip lookup ──────────────────────────────────────────────────────────────
//
// sunoapi.org supports fetching clips by ID via the same record-info endpoint,
// using the `ids` query param instead of `taskId`.

async function fetchClip(
  clipId: string,
  apiKey: string
): Promise<{ clip: Record<string, unknown> | null; raw: unknown }> {
  const res = await fetch(
    `${BASE_URL}/generate/record-info?ids=${encodeURIComponent(clipId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (!res.ok) throw new Error(`sunoapi.org returned ${res.status}`);
  const json = await res.json() as Record<string, unknown>;

  // The API wraps results in { data: [...clips] } or { data: { clips: [...] } }
  const dataNode = json.data;

  if (Array.isArray(dataNode) && dataNode.length > 0) {
    return { clip: dataNode[0] as Record<string, unknown>, raw: json };
  }

  if (dataNode && typeof dataNode === "object") {
    const inner = (dataNode as Record<string, unknown>);
    for (const key of ["clips", "records", "songs", "results"]) {
      const arr = inner[key];
      if (Array.isArray(arr) && arr.length > 0) {
        return { clip: arr[0] as Record<string, unknown>, raw: json };
      }
    }
  }

  return { clip: null, raw: json };
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const clipId = req.nextUrl.searchParams.get("clipId");
  if (!clipId) return NextResponse.json({ error: "clipId required" }, { status: 400 });

  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey)  return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });

  try {
    const { clip, raw } = await fetchClip(clipId, apiKey);

    if (!clip) {
      // Return raw payload so developers can inspect the shape
      return NextResponse.json({
        found: false,
        clipId,
        rawKeys: typeof raw === "object" && raw !== null ? Object.keys(raw) : [],
        rawSnippet: JSON.stringify(raw).slice(0, 1200),
      });
    }

    const timedLyrics = extractTimedLyrics(clip);

    console.log(
      `[timed-lyrics] clipId=${clipId} keys=[${Object.keys(clip).join(",")}]`,
      timedLyrics ? `found ${timedLyrics.length} segments` : "no timing data"
    );

    return NextResponse.json({
      found: true,
      clipId,
      timedLyrics,               // null if not present
      hasTimedLyrics: !!timedLyrics,
      // Exploration helpers — remove once format is confirmed
      clipKeys:   Object.keys(clip),
      rawSnippet: JSON.stringify(clip).slice(0, 2000),
    });
  } catch (err) {
    console.error("[timed-lyrics] fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch clip" },
      { status: 502 }
    );
  }
}
