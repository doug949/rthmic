import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { tracks } from "@/app/data/tracks";
import type { GenerateResponse } from "@/app/types/rthm";

const TRACK_LIST = tracks.map((t) => `${t.id}: ${t.title}`).join("\n");

const SYSTEM_PROMPT = `You are RTHMIC's generation engine. You interpret a user's spoken state and produce a RTHM DNA — a structured specification for a short rhythm-based audio track designed to move someone physically, mentally, or emotionally.

## The 5 Pillars
Every RTHM belongs to exactly one pillar:

1. **Memorization** — tracks for encoding information through rhythm and repetition. Used when someone needs to remember something: facts, names, steps, sequences.
2. **Menus** — tracks for navigating decisions and options. Used when someone is overwhelmed by choices, stuck in analysis paralysis, or needs to commit to a path.
3. **Mindset** — tracks for shifting emotional or psychological state. Used when someone is anxious, demotivated, fearful, or needs a state change.
4. **Mode** — tracks for entering a specific work mode. Used when someone needs to get into deep focus, creative flow, or a performance state.
5. **Algorithm** — tracks for executing a known process step by step. Used when someone knows what to do but needs help doing it — task runners, routines, workflows.

## RTHM DNA Format
Respond ONLY with valid JSON. No markdown, no explanation, no code fences.

{
  "state": "one sentence describing what the user is experiencing right now",
  "intent": "one sentence describing what they need to do or feel",
  "friction": "one sentence identifying the specific block or resistance",
  "type": "one of: Memorization | Menus | Mindset | Mode | Algorithm",
  "dna": {
    "title": "A short evocative RTHM title (3-6 words)",
    "state": "2-3 sentences expanding on the user's current state",
    "intent": "2-3 sentences on the intended outcome of this RTHM",
    "type": "same pillar as above",
    "algorithm": "the core rhythmic or cognitive pattern this track encodes (e.g. '4-count breath with action trigger on beat 4')",
    "rhythmNotes": "tempo, time signature, energy arc (e.g. 'BPM 95-110, builds from sparse to dense, drops at midpoint')",
    "voiceStyle": "describe the voice/narration style if any (e.g. 'dry, matter-of-fact, no filler words' or 'warm, close-mic, spoken-word')",
    "tags": ["array", "of", "3-6", "keywords"],
    "duration": "target duration e.g. '90 seconds' or '2 minutes'"
  },
  "sunoPrompt": "A Suno-ready music generation prompt. Include genre, BPM, energy, key instruments, mood, and any lyrical/vocal direction. Max 200 words.",
  "matchingTrackIds": ["array of 1-3 track IDs from the library that best match this state/intent"]
}

## Track Library
Use this list to select matchingTrackIds. Match by title semantics to the user's state and pillar:

${TRACK_LIST}`;

export async function POST(req: NextRequest) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 3) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `User's spoken state:\n"${transcript.trim()}"`,
        },
      ],
    });

    // Extract the text content block
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response generated" }, { status: 500 });
    }

    let parsed: GenerateResponse;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse generation output", raw: textBlock.text },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
