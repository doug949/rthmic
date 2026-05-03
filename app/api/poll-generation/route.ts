// Single-shot poll for a Suno task. Called from the frontend every 5s.
// Returns { status: "pending"|"ready"|"failed", songs? }
// Suno returns 2 clips per task — both are surfaced as Song A and Song B.

import { NextRequest, NextResponse } from "next/server";
import type { Song } from "@/app/types/pipeline";

const BASE_URL = "https://api.sunoapi.org/api/v1";

export const maxDuration = 10;

type SunoClip = Record<string, unknown>;

function extractClips(node: unknown, depth = 0): SunoClip[] {
  if (depth > 4 || !node || typeof node !== "object") return [];

  if (Array.isArray(node)) {
    if (node.length > 0) {
      const first = node[0] as Record<string, unknown>;
      if (first.audio_url || first.stream_audio_url || first.id) {
        return node as SunoClip[];
      }
    }
    for (const item of node) {
      const found = extractClips(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }

  const obj = node as Record<string, unknown>;
  const priorityKeys = ["clips", "data", "response", "songs", "results", "records"];
  for (const key of priorityKeys) {
    if (obj[key]) {
      const found = extractClips(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }
  for (const [key, val] of Object.entries(obj)) {
    if (!priorityKeys.includes(key) && Array.isArray(val) && val.length > 0) {
      const found = extractClips(val, depth + 1);
      if (found.length > 0) return found;
    }
  }

  return [];
}

const STILL_WAITING = new Set(["PENDING", "GENERATING", "IN_QUEUE", "QUEUED", "TEXT_SUCCESS", "RUNNING"]);

function getAudioUrl(clip: Record<string, unknown>): string | undefined {
  const candidates = [
    clip.stream_audio_url,
    clip.audio_url,
    clip.url,
    clip.mp3_url,
    clip.audioUrl,
    clip.streamUrl,
    clip.stream_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  if (!process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { status: "failed", error: `Suno poll error ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    console.log("Poll response:", JSON.stringify(json).slice(0, 800));

    const task = json.data;
    const rawStatus = (
      (typeof task === "object" && task !== null ? (task as Record<string, unknown>).status : null) ??
      json.status ??
      ""
    ).toString().toUpperCase();

    console.log("Parsed status:", rawStatus);

    if (rawStatus === "FAILED") {
      return NextResponse.json({ status: "failed", error: "Suno generation failed" });
    }

    const clips = extractClips(json);
    const playableClips = clips.filter(c => getAudioUrl(c));

    console.log(`Found ${clips.length} clips (${playableClips.length} playable), status="${rawStatus}"`);

    const stillWaiting = STILL_WAITING.has(rawStatus);

    if (playableClips.length > 0 && !stillWaiting) {
      const toSong = (clip: SunoClip, idx: number): Song => {
        const baseTitle = String(clip.title ?? `RTHM ${idx + 1}`);
        return {
          id: `${String(clip.id ?? "suno")}-${idx}`,
          title: idx === 0 ? baseTitle : `${baseTitle} (Variation)`,
          audioUrl: getAudioUrl(clip),
        };
      };

      const songs: [Song, Song] = [
        toSong(playableClips[0], 0),
        toSong(playableClips[1] ?? playableClips[0], 1),
      ];

      return NextResponse.json(
        { status: "ready", songs },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { status: "pending", rawStatus, clipsFound: clips.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Poll generation error:", err);
    return NextResponse.json(
      { status: "failed", error: err instanceof Error ? err.message : "Poll failed" },
      { status: 500 }
    );
  }
}
