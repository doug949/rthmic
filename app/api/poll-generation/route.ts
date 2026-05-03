// Single-shot poll for one or two Suno tasks.
// Called from the frontend every 5s.
// Accepts taskIdA (required) + taskIdB (optional).
// Returns { status: "pending"|"ready"|"failed", songs? }
// When both IDs provided, returns "ready" only when BOTH tasks have playable clips.

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

interface TaskResult {
  ready: boolean;
  failed: boolean;
  clip?: SunoClip;
  error?: string;
}

async function pollTask(taskId: string): Promise<TaskResult> {
  const res = await fetch(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
  );

  if (!res.ok) {
    return { ready: false, failed: false }; // transient error — keep polling
  }

  const json = await res.json();
  console.log(`Poll [${taskId.slice(0, 8)}]:`, JSON.stringify(json).slice(0, 400));

  const task = json.data;
  const rawStatus = (
    (typeof task === "object" && task !== null ? (task as Record<string, unknown>).status : null) ??
    json.status ??
    ""
  ).toString().toUpperCase();

  if (rawStatus === "FAILED") {
    return { ready: false, failed: true, error: "Suno generation failed" };
  }

  const clips = extractClips(json);
  const playableClips = clips.filter(c => getAudioUrl(c));

  console.log(`  → status="${rawStatus}" clips=${clips.length} playable=${playableClips.length}`);

  if (playableClips.length > 0 && !STILL_WAITING.has(rawStatus)) {
    return { ready: true, failed: false, clip: playableClips[0] };
  }

  return { ready: false, failed: false };
}

export async function GET(req: NextRequest) {
  const taskIdA = req.nextUrl.searchParams.get("taskIdA") ?? req.nextUrl.searchParams.get("taskId");
  const taskIdB = req.nextUrl.searchParams.get("taskIdB");

  if (!taskIdA) {
    return NextResponse.json({ error: "taskIdA required" }, { status: 400 });
  }
  if (!process.env.SUNO_API_KEY) {
    return NextResponse.json({ error: "SUNO_API_KEY not set" }, { status: 500 });
  }

  try {
    if (taskIdB) {
      // Dual-task mode — check both in parallel, ready only when both have clips
      const [resultA, resultB] = await Promise.all([
        pollTask(taskIdA),
        pollTask(taskIdB),
      ]);

      if (resultA.failed || resultB.failed) {
        return NextResponse.json({ status: "failed", error: "Music generation failed" });
      }

      if (resultA.ready && resultA.clip && resultB.ready && resultB.clip) {
        const songs: [Song, Song] = [
          {
            id: `${String(resultA.clip.id ?? "suno-a")}-0`,
            title: String(resultA.clip.title ?? "Rhythm A"),
            audioUrl: getAudioUrl(resultA.clip),
          },
          {
            id: `${String(resultB.clip.id ?? "suno-b")}-1`,
            title: String(resultB.clip.title ?? "Rhythm B"),
            audioUrl: getAudioUrl(resultB.clip),
          },
        ];
        return NextResponse.json(
          { status: "ready", songs },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        { status: "pending", readyA: resultA.ready, readyB: resultB.ready },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Single-task mode (backwards compat or single song scenarios)
    const result = await pollTask(taskIdA);

    if (result.failed) {
      return NextResponse.json({ status: "failed", error: result.error ?? "Generation failed" });
    }

    if (result.ready && result.clip) {
      const clip = result.clip;
      const baseTitle = String(clip.title ?? "RTHM");
      const songs: [Song, Song] = [
        { id: `${String(clip.id ?? "suno")}-0`, title: baseTitle, audioUrl: getAudioUrl(clip) },
        { id: `${String(clip.id ?? "suno")}-1`, title: `${baseTitle} (Alternate)`, audioUrl: getAudioUrl(clip) },
      ];
      return NextResponse.json(
        { status: "ready", songs },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { status: "pending" },
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
