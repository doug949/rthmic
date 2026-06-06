// musicService — sunoapi.org integration
// API docs: https://docs.sunoapi.org
// Real Suno is used when SUNO_API_KEY is present; mock otherwise.

import { tracks } from "@/app/data/tracks";
import type { Song, PillarType } from "@/app/types/pipeline";
import { toSunoPronunciation } from "@/app/lib/sunoLyrics";
import { extractSunoTaskId, sunoStartError } from "@/app/lib/sunoResponse";
import { buildSunoStyle } from "@/app/lib/sunoStyle";

const USE_MOCK = !process.env.SUNO_API_KEY;
const BASE_URL = "https://api.sunoapi.org/api/v1";

// Map RTHMIC pillars to Suno style tags
const PILLAR_STYLES: Record<PillarType, string> = {
  Memory:        "ambient, sparse, 75bpm, warm, melodic, repetitive motif",
  Menus:         "ambient lofi, 80bpm, spacious, gentle, cyclical",
  Mindset:       "cinematic, piano, orchestral build, 80bpm, emotional arc",
  Mode:          "minimal electronic, 90bpm, grounding pulse, close and clear",
  Movement:      "microhouse, hypnotic, 95bpm, steady groove, forward momentum",
  Understanding: "indie folk, acoustic, 78bpm, patient, clear melodic phrasing",
  Bridge:        "intimate indie pop, warm piano, 76bpm, tender, personal, close vocal",
  Invite:        "indie electronic, uplifting male vocal, 92bpm, warm and arresting, forward energy, memorable hook",
  Journal:       "acoustic indie folk, warm male vocal, 74bpm, intimate, reflective, end-of-day, understated",
  Epiphany:      "indie electronic, bright acoustic guitar, 96bpm, electric, excited, forward momentum, ideas landing",
  Explain:       "indie folk, acoustic guitar, clear male vocal, 78bpm, calm, conversational, unhurried, patient, instructional",
  BookSummary:   "indie folk, acoustic guitar, clear vocal, 82bpm, confident, warm, conversational, the energy of a good recommendation",
  Sleep:         "ambient indie lullaby, soft male vocal, 68bpm, warm low synths, gentle acoustic guitar, intimate, nocturnal, spacious, adult lullaby",
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
      model: "V5",
      prompt: toSunoPronunciation(lyrics),   // phonetic substitution for branded spellings
      style: buildSunoStyle(PILLAR_STYLES[pillar]), // genre/mood tags
      title: `RTHM — ${pillar}`,
      callBackUrl: "https://rthmic.app/api/suno-webhook", // required by sunoapi.org; we use polling
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Suno generate error ${res.status}: ${body}`);
  }

  const json = await res.json();
  console.log("Suno generate response:", JSON.stringify(json));

  const apiError = sunoStartError(json);
  if (apiError) throw new Error(apiError);

  const taskId = extractSunoTaskId(json);

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
  Memory:        ["Anchor",   "Encode",     "Third Pass",  "Hold",      "Pattern"],
  Menus:         ["Options",  "The List",   "One Choice",  "Open",      "Field"],
  Mindset:       ["Shift",    "Ground",     "Turn",        "Weight",    "Opening"],
  Mode:          ["Still",    "Steady",     "Return",      "Floor",     "Breath"],
  Movement:      ["Groove",   "Thread",     "Step",        "Forward",   "Loop"],
  Understanding: ["Model",    "Clarity",    "Frame",       "Shape",     "Map"],
  Bridge:        ["For You",  "With You",   "Between Us",  "To You",    "This One"],
  Invite:        ["Come In",  "Open Door",  "First Listen", "Welcome In", "Your Invitation"],
  Journal:       ["That Was Today", "End of Day", "Before I Forget", "Kept Now", "This One Day"],
  Epiphany:      ["The Spark", "That Thought", "Write It Down", "Before It Shifts", "The Click"],
  Explain:       ["How It Works", "The Clear One", "Step by Step", "Now You Have It", "The Logic"],
  BookSummary:   ["The Big Idea", "The Core", "One Big Thing", "What It Says", "The Premise"],
  Sleep:         ["The Dark", "Night Room", "Soft Landing", "Lights Down", "Tomorrow Outside"],
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
