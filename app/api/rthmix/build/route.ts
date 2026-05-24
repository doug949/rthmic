import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis, type RedisClient } from "@/app/lib/redis";
import { withRedisQueue, getUserJobIds, getJob, pushJob, updateJob, indexTaskId } from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";
import { extractSunoTaskId } from "@/app/lib/sunoResponse";
import { buildSunoStyle } from "@/app/lib/sunoStyle";
import type { PillarType } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

export const maxDuration = 60;

const MAX_CONCURRENT = 5;
const SUNO_BASE = "https://api.sunoapi.org/api/v1";
const APP_URL = "https://rthmic.app";
const SUNO_CHAR_LIMIT = 5000;

interface RthmixTrackPlan {
  number: string;
  title: string;
  role: "ground-zero" | "unlock" | "bonus";
  unlock: string;
  buildsFrom: string;
  lyrics: string;
}

interface RthmixPlan {
  rthmixId: string;
  title: string;
  topic: string;
  albumArtPrompt: string;
  tracks: RthmixTrackPlan[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "rthmix";
}

function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function normaliseTrackNumber(index: number): string {
  return index === 0 ? "00" : String(index).padStart(2, "0");
}

function trackRole(index: number, total: number): RthmixTrackPlan["role"] {
  if (index === 0) return "ground-zero";
  if (index === total - 1) return "bonus";
  return "unlock";
}

function sanitisePlan(raw: RthmixPlan, topic: string): RthmixPlan {
  const tracks = Array.isArray(raw.tracks) ? raw.tracks.slice(0, 12) : [];
  if (tracks.length < 6) throw new Error("Rthmix plan returned too few tracks");

  const title = typeof raw.title === "string" && raw.title.trim()
    ? raw.title.trim().slice(0, 80)
    : `${topic.slice(0, 48)} Rthmix`;

  return {
    rthmixId: `rthmix-${Date.now()}-${slugify(title)}`,
    title,
    topic,
    albumArtPrompt: typeof raw.albumArtPrompt === "string" && raw.albumArtPrompt.trim()
      ? raw.albumArtPrompt.trim().slice(0, 500)
      : `Square album cover for a RTHMIC Rthmix about ${topic}, cinematic, clean, premium, modern.`,
    tracks: tracks.map((track, index) => ({
      number: normaliseTrackNumber(index),
      title: (typeof track.title === "string" && track.title.trim() ? track.title.trim() : `Track ${normaliseTrackNumber(index)}`).slice(0, 80),
      role: trackRole(index, tracks.length),
      unlock: (typeof track.unlock === "string" && track.unlock.trim() ? track.unlock.trim() : "One clear unlock").slice(0, 180),
      buildsFrom: (typeof track.buildsFrom === "string" ? track.buildsFrom : "").slice(0, 220),
      lyrics: (typeof track.lyrics === "string" ? track.lyrics : "").slice(0, SUNO_CHAR_LIMIT),
    })).filter((track) => track.lyrics.trim().length > 0),
  };
}

async function planRthmix(topic: string): Promise<RthmixPlan> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    system: `You design RTHMIC Rthmix albums. A Rthmix is a sequence of short generated songs that installs a topic one unlock at a time.

Rules:
- Return only JSON.
- Choose 6 to 12 total tracks, including track 00.
- Track 00 introduces the topic, the promise of the album, and how to listen.
- Every later track has exactly one new unlock.
- Every later track must briefly refer to the previous unlock before introducing the new unlock.
- The final track should consolidate the chain and make the listener feel the sequence is complete.
- Lyrics must use [VERSE], [CHORUS], [BRIDGE], and/or [OUTRO] section labels.
- Lyrics should be practical, clear, vivid, and sequential. Avoid generic self-help and obvious rhymes.
- Each track must fit Suno custom prompt limits, so keep lyrics under 4200 characters.

JSON shape:
{
  "title": "short album title",
  "topic": "user topic",
  "albumArtPrompt": "square album cover prompt",
  "tracks": [
    {
      "title": "track title",
      "unlock": "one sentence naming the unlock",
      "buildsFrom": "what previous track this depends on; empty for track 00",
      "lyrics": "full lyrics"
    }
  ]
}`,
    messages: [
      {
        role: "user",
        content: `Build a one-shot Rthmix plan for this topic:\n\n${topic}`,
      },
    ],
  });

  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  return sanitisePlan(extractJson<RthmixPlan>(text), topic);
}

async function getVocalistPref(uid: string): Promise<"male" | "female" | "none"> {
  try {
    if (!REDIS_AVAILABLE) return "none";
    return await withRedis(async (client) => {
      const raw = await client.get(`settings:${uid}`);
      if (!raw) return "none";
      const settings = JSON.parse(raw);
      return settings.vocalist === "male" || settings.vocalist === "female" ? settings.vocalist : "none";
    });
  } catch {
    return "none";
  }
}

async function countGenerating(client: RedisClient, userId: string): Promise<number> {
  const ids = await getUserJobIds(client, userId);
  let count = 0;
  for (const id of ids) {
    const job = await getJob(client, id);
    if (job?.status === "generating") count++;
  }
  return count;
}

async function startSunoJob(job: QueueJob): Promise<string | null> {
  try {
    const res = await fetch(`${SUNO_BASE}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customMode: true,
        instrumental: false,
        model: "V5",
        prompt: job.lyrics,
        style: buildSunoStyle(job.genre),
        title: job.title,
        callBackUrl: `${APP_URL}/api/suno-webhook`,
      }),
    });
    if (!res.ok) {
      console.error(`[rthmix] Suno start failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const json = await res.json();
    return extractSunoTaskId(json);
  } catch (error) {
    console.error("[rthmix] Suno start error:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ error: "Queue not configured" }, { status: 500 });
  if (!process.env.SUNO_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Generation not configured" }, { status: 500 });
  }

  const body = await req.json();
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 500) : "";
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const plan = await planRthmix(topic);
  const vocalist = await getVocalistPref(uid);
  const queued: string[] = [];
  const pillar: PillarType = "Understanding";
  const style: StyleChoice = "B";
  const baseGenre = vocalist === "none"
    ? "Indie folk electronic, reflective vocal, acoustic guitar, warm synth pads, clear educational cadence, album continuity"
    : `Indie folk electronic, ${vocalist} vocalist, acoustic guitar, warm synth pads, clear educational cadence, album continuity`;

  for (const track of plan.tracks) {
    const jobId = crypto.randomUUID();
    const job: QueueJob = {
      jobId,
      userId: uid,
      status: "pending",
      pillar,
      title: track.title,
      style,
      lyrics: toSunoPronunciation(track.lyrics),
      genre: baseGenre,
      note: `Rthmix: ${plan.title}. Track ${track.number}: ${track.unlock}${track.buildsFrom ? ` Builds from: ${track.buildsFrom}` : ""}`,
      rthmixId: plan.rthmixId,
      rthmixTitle: plan.title,
      rthmixType: "progression",
      rthmixTrackNumber: track.number,
      rthmixTrackRole: track.role,
      rthmixUnlock: track.unlock,
      rthmixAlbumArtPrompt: plan.albumArtPrompt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await pushJob(job);
    queued.push(jobId);

    await withRedisQueue(async (client) => {
      const generating = await countGenerating(client, uid);
      if (generating >= MAX_CONCURRENT) return;
      const taskId = await startSunoJob(job);
      if (!taskId) return;
      job.sunoTaskId = taskId;
      job.status = "generating";
      await updateJob(client, job);
      await indexTaskId(client, taskId, jobId);
    });
  }

  return NextResponse.json({ plan, queued });
}
