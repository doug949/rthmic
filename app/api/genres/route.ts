// /api/genres — returns built-in RTHMIC presets (always) + user's saved styles (if set).
//
// Genre string format: "Display Name|Full Suno style prompt"
// The pipe separates the UI label from the exact text sent to Suno.
// Genres without a pipe use the full string for both display and Suno.
//
// Response shape:
//   { builtIn: string[], user: string[] }
//   builtIn  = permanent RTHMIC-curated presets, never overwritten
//   user     = user's saved custom styles (empty array if not configured)
//
// Backward compat: also returns `genres` = user styles || builtIn (for
// callers that haven't been updated to the new shape yet).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

// ─── RTHMIC built-in reference styles ────────────────────────────────────────
// These are permanent. They are never replaced by user customisation.
// "Scandinavian Microhouse" is the canonical RTHMIC voice — always first.

export const BUILTIN_GENRES = [
  "Scandinavian Microhouse|Scandinavian minimal microhouse. Warm male voice, slightly vocoded, intimate and understated. Hypnotic and repetitive like a focus mantra. Clean electronic groove, soft synth pads, gentle pulsing bass, minimal percussion. 90 BPM. Emotionally grounded, intelligent, premium. No sharp edges, no drops, no build-ups. Calm forward motion.",
  "Morning Momentum|Muted morning productivity groove. Warm Scandinavian male voice, slightly vocoded. Hypnotic and repetitive like a focus mantra for momentum. Clean electronic groove, soft synth pads, pulsing bass, minimal percussion. Comforting and motivating without sharp edges. Not aggressive, not over-energised.",
  "Hamilton Hip-Hop|Hamilton-style Broadway hip-hop in the zone of Lin-Manuel Miranda and clipping. Fast dense rap verses, punchy staccato delivery, clearly enunciated syllables, rapid-fire rhyme schemes. Hip-hop drums with snare crack and driving kick, brass stabs, harpsichord accents, no soft piano. Anthemic shouted ensemble chorus. Spoken word bridge with urgency. Driving relentless forward energy, 100-110 BPM.",
  "Calm Focus|Calm futuristic focus music. Warm male robotic voice, slightly vocoded. Hypnotic and repetitive like a focus mantra. Minimal house pulse, clean electronic groove, soft synth pads, pulsing bass, restrained percussion. Designed for organising, thinking, and steady forward attention.",
  "Nordic Night|Very slow Scandinavian ambient electronic. 70-80 BPM. Positive and reassuring. Soft analog pads, gentle pulsing bass, extremely restrained percussion, almost no drums. No dance energy, no drops, no build-ups. Soft Nordic male vocal, intimate and understated, lightly breathy and conversational, slightly vocoded. Quiet night routine energy.",
  "Sunny Pop|Sunny upbeat 90s and 00s pop. Male vocal, relaxed talk-sung delivery. Bright guitar, funky bass, light drums, handclaps. Big catchy singalong chorus, feel-good hook. Warm, slightly lo-fi, playful, human.",
];

const REDIS_AVAILABLE = !!process.env.REDIS_URL;

async function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("rthmic_uid")?.value;
  let userGenres: string[] = [];

  if (uid && REDIS_AVAILABLE) {
    const client = await getClient();
    try {
      const raw = await client.get(`genres:${uid}`);
      if (raw) userGenres = JSON.parse(raw);
    } finally {
      await client.disconnect();
    }
  }

  return NextResponse.json({
    builtIn: BUILTIN_GENRES,
    user: userGenres,
    // Legacy field: callers expecting a flat `genres` array get the built-ins
    // (or user genres if they've customised).  Updated callers use builtIn + user.
    genres: userGenres.length > 0 ? userGenres : BUILTIN_GENRES,
  });
}

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("rthmic_uid")?.value;
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { genres } = await req.json();
  if (!Array.isArray(genres) || genres.length < 1 || genres.length > 10 || genres.some((g) => typeof g !== "string" || !g.trim())) {
    return NextResponse.json({ error: "Must provide 1–10 non-empty genre strings" }, { status: 400 });
  }

  if (!REDIS_AVAILABLE) {
    return NextResponse.json({ ok: true }); // dev fallback
  }

  const client = await getClient();
  try {
    await client.set(
      `genres:${uid}`,
      JSON.stringify(genres.map((g: string) => g.trim())),
      { EX: 60 * 60 * 24 * 365 }
    );
    return NextResponse.json({ ok: true });
  } finally {
    await client.disconnect();
  }
}
