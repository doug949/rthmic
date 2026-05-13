// /api/timed-lyrics — fetch word-level synchronized lyrics from sunoapi.org.
//
// sunoapi.org endpoint: POST /api/v1/generate/get-timestamped-lyrics
// Requires BOTH taskId AND audioId (the clip ID).
// Returns alignedWords[] with word-level timestamps in seconds.
//
// GET /api/timed-lyrics?taskId=<taskId>&audioId=<audioId>
//
// Response:
//   { timedWords: TimedWord[], wordCount: number }
//   or { error, rawSnippet } on failure

import { NextRequest, NextResponse } from "next/server";
import type { TimedWord } from "@/app/types/pipeline";

const BASE_URL = "https://api.sunoapi.org/api/v1";
export const maxDuration = 15;

interface AlignedWord {
  word: string;
  success: boolean;
  startS: number;
  endS: number;
  palign?: number;
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const taskId  = req.nextUrl.searchParams.get("taskId");
  const audioId = req.nextUrl.searchParams.get("audioId");

  if (!taskId)  return NextResponse.json({ error: "taskId required" }, { status: 400 });
  if (!audioId) return NextResponse.json({ error: "audioId required" }, { status: 400 });

  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey)  return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });

  try {
    const res = await fetch(`${BASE_URL}/generate/get-timestamped-lyrics`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId, audioId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[timed-lyrics] sunoapi returned ${res.status}:`, text.slice(0, 400));
      return NextResponse.json(
        { error: `sunoapi.org returned ${res.status}`, rawSnippet: text.slice(0, 400) },
        { status: 502 }
      );
    }

    const json = await res.json() as { code?: number; data?: { alignedWords?: AlignedWord[]; waveformData?: number[] } };
    const data = json?.data;

    console.log(
      `[timed-lyrics] taskId=${taskId} audioId=${audioId}`,
      data?.alignedWords ? `alignedWords=${data.alignedWords.length}` : "no alignedWords",
      `rawKeys=[${Object.keys(json).join(",")}]`
    );

    if (!data?.alignedWords || data.alignedWords.length === 0) {
      return NextResponse.json({
        timedWords: null,
        rawSnippet: JSON.stringify(json).slice(0, 1200),
      });
    }

    // Filter to successful words and map to our type
    const timedWords: TimedWord[] = data.alignedWords
      .filter((w) => w.success !== false && typeof w.startS === "number" && typeof w.endS === "number" && w.word?.trim())
      .map((w) => ({
        word: w.word.trim(),
        startS: w.startS,
        endS: w.endS,
        success: w.success ?? true,
      }));

    return NextResponse.json({
      timedWords: timedWords.length > 0 ? timedWords : null,
      wordCount: timedWords.length,
    });
  } catch (err) {
    console.error("[timed-lyrics] fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch timed lyrics" },
      { status: 502 }
    );
  }
}
