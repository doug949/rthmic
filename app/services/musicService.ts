// musicService — sunoapi.org integration
// API docs: https://docs.sunoapi.org
// Real Suno is used when SUNO_API_KEY is present; mock otherwise.

import { tracks } from "@/app/data/tracks";
import type { Song, PillarType } from "@/app/types/pipeline";

const USE_MOCK = !process.env.SUNO_API_KEY;
const BASE_URL = "https://api.sunoapi.org/api/v1";

// Map RTHMIC pillars to Suno style tags
const PILLAR_STYLES: Record<PillarType, string> = {
  Mode:         "driving electronic, minimal, 100bpm, focus, hypnotic",
  Algorithm:    "lo-fi hip hop, steady beat, 85bpm, calm, spoken word",
  Menu:         "indie pop, acoustic guitar, 92bpm, thoughtful, introspective",
  Memorisation: "ambient, sparse, 75bpm, repetitive motif, meditative",
  Mindset:      "cinematic, piano, orchestral build, 80bpm, emotional arc",
};

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

interface SunoClip {
  id: string;
  title: string;
  audio_url: string;
  stream_audio_url: string;
  duration: number;
}

async function pollForClips(taskId: string, maxWaitMs = 200_000): Promise<SunoClip[]> {
  const INTERVAL = 5000;
  const maxAttempts = Math.ceil(maxWaitMs / INTERVAL);

  for (let i = 0; i < maxAttempts; i++) {
    await delay(INTERVAL);

    const res = await fetch(
      `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
    );

    if (!res.ok) throw new Error(`Suno poll error: ${res.status}`);
    const json = await res.json();
    console.log(`Suno poll ${i + 1}/${maxAttempts} status:`, JSON.stringify(json).slice(0, 800));

    const task = json.data;

    // Normalise status to uppercase string for comparison
    const status = ((task?.status ?? json.status ?? "") as string).toUpperCase();

    // Extract clips from every path sunoapi.org might use
    const clips: SunoClip[] =
      (Array.isArray(task?.response?.data) ? task.response.data : null) ??
      (Array.isArray(task?.clips)          ? task.clips          : null) ??
      (Array.isArray(task?.data)           ? task.data           : null) ??
      (Array.isArray(json.clips)           ? json.clips          : null) ??
      [];

    console.log(`  → status="${status}" clips=${clips.length} taskKeys=${Object.keys(task ?? {}).join(",")}`);

    // Return as soon as we have clips and generation is done
    if (clips.length > 0 && status !== "PENDING" && status !== "GENERATING" && status !== "IN_QUEUE" && status !== "QUEUED") {
      return clips;
    }

    if (status === "FAILED") {
      throw new Error("Suno generation failed");
    }
    // PENDING / GENERATING / IN_QUEUE — keep polling
  }

  throw new Error(`Suno generation timed out after ${Math.round(maxWaitMs / 1000)}s`);
}

export async function generateSongs(lyrics: string, pillar: PillarType): Promise<[Song, Song]> {
  if (USE_MOCK) {
    // MOCK: simulate latency, return 2 library tracks as stand-ins
    await delay(2000 + Math.random() * 1000);
    return getMockSongs(pillar);
  }

  // Real sunoapi.org call
  // Suno generates 2 clips per request by default — one POST gives us both songs
  const res = await fetch(`${BASE_URL}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customMode: true,
      instrumental: false,
      model: "V4",
      prompt: lyrics,                       // lyrics in custom mode
      style: PILLAR_STYLES[pillar],         // genre/mood tags
      title: `RTHM — ${pillar}`,
      callBackUrl: "https://rthmic.vercel.app/api/suno-webhook", // required by sunoapi.org; we use polling
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Suno generate error ${res.status}: ${body}`);
  }

  const json = await res.json();
  console.log("Suno generate response:", JSON.stringify(json));

  // sunoapi.org may return taskId at json.data.taskId or json.data directly
  const taskId: string =
    json.data?.taskId ??          // { data: { taskId: "..." } }
    (typeof json.data === "string" ? json.data : undefined) ?? // { data: "taskId" }
    json.taskId;                  // { taskId: "..." }

  if (!taskId) {
    throw new Error(
      `Suno returned no taskId. Full response: ${JSON.stringify(json).slice(0, 400)}`
    );
  }

  const clips = await pollForClips(taskId);
  if (clips.length < 1) throw new Error("Suno returned no clips");

  // Prefer stream_audio_url (ready in ~30s) over audio_url (ready in ~2min)
  const toSong = (clip: SunoClip): Song => ({
    id: clip.id,
    title: clip.title || `RTHM — ${pillar}`,
    audioUrl: clip.stream_audio_url || clip.audio_url,
  });

  const [a, b] = clips;
  return [toSong(a), toSong(b ?? a)]; // fallback to same clip if only 1 returned
}

// ─── Mock helpers ────────────────────────────────────────────────────────────

function seededPick<T>(arr: T[], seed: number, n: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  let s = seed;
  while (out.length < n) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const idx = s % arr.length;
    if (!used.has(idx)) { used.add(idx); out.push(arr[idx]); }
  }
  return out;
}

const TITLE_PREFIXES = ["The", "After the", "Before the", "Through the", "Into the", "Beyond the", "At the"];
const TITLE_NOUNS: Record<PillarType, string[]> = {
  Mode:         ["Lock",    "Flow State",  "Threshold",   "Signal",    "Protocol"],
  Algorithm:    ["Process", "Clear Pass",  "Next Step",   "Exit",      "Sequence"],
  Menu:         ["Choice",  "Fork",        "One Path",    "Commit",    "Clearing"],
  Memorisation: ["Anchor",  "Encode",      "Third Pass",  "Hold",      "Pattern"],
  Mindset:      ["Shift",   "Ground",      "Turn",        "Weight",    "Opening"],
};

function mockTitle(pillar: PillarType, seed: number): string {
  const s1 = (seed * 1103515245 + 12345) & 0x7fffffff;
  const s2 = (s1 * 1103515245 + 12345) & 0x7fffffff;
  return `${TITLE_PREFIXES[s1 % TITLE_PREFIXES.length]} ${TITLE_NOUNS[pillar][s2 % TITLE_NOUNS[pillar].length]}`;
}

export function getMockSongs(pillar: PillarType): [Song, Song] {
  const seed = Date.now();
  const picked = seededPick(tracks, seed, 2);
  return [
    { id: `mock-${seed}-0`, title: mockTitle(pillar, seed),     trackId: picked[0].id, trackAudioKey: picked[0].audioKey },
    { id: `mock-${seed}-1`, title: mockTitle(pillar, seed + 7), trackId: picked[1].id, trackAudioKey: picked[1].audioKey },
  ];
}
