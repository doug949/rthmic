// llmService
// USE_MOCK = true → returns pre-written outputs keyed by pillar (no API cost).
// Set USE_MOCK = false to use Claude (claude-opus-4-7) for real interpretation.

import Anthropic from "@anthropic-ai/sdk";
import { detectPillar, loadTemplate } from "@/app/lib/templateEngine";
import type { PillarType, StateSummary } from "@/app/types/pipeline";

const USE_MOCK = false; // uses Claude claude-opus-4-7 via ANTHROPIC_API_KEY

// Musical style the LLM selects based on the user's state.
// Both styles share the same indie-electronic aesthetic and instrumentation —
// they feel like variations of the same direction, not opposite ends of a spectrum.
// A = grounded energy, activation
// B = calm focus, settling
export type StyleChoice = "A" | "B";

export interface LLMResult {
  pillar: PillarType;
  stateSummary: StateSummary;
  title: string;
  lyrics: string;
  style: StyleChoice;
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Lyrics spec ─────────────────────────────────────────────────────────────

const LYRICS_SPEC = `You are RTHMIC's interpretation engine. RTHMIC uses rhythm songs to install mindsets, systems, and operating modes — not entertainment.

LYRICS SPEC v1.1:
- Purpose: install a mindset/system/operating mode, not write a pop song
- Each line must carry: practical instruction + metaphor + emotional truth
- Be verbose when depth is needed — embed the idea fully
- Use concrete imagery that fires recognition (not decoration)
- Mix the practical (what to do) with the conceptual (why it matters)
- No clichés, no generic self-help, no obvious end-rhymes
- Rhythm comes from cadence, repetition, and line weight — not rhyme
- Structure: use [VERSE] / [CHORUS] / [BRIDGE] labels — write naturally within them
- Length: as long as needed to fully install the idea, up to 5000 characters

SONG ENDINGS (REQUIRED):
- The song must have a clear, conclusive closing section — no abrupt stops
- Write a final section that resolves the emotional arc
- End with a memorable final line or an echo of a key earlier phrase
- The listener must feel the song is complete

SONG TITLE:
Generate a short (3–5 word) title that names the operating mode or mindset being installed — not the user's problem. Poetic but concrete. No generic self-help. Examples: "Start Before You're Ready", "One Window Open", "First One Then Next", "Say It Out Loud". Include as "title" in JSON.

MUSICAL STYLE SELECTION:
After interpreting the user's state, choose the style that best serves what they need RIGHT NOW.
Both styles are warm, human, indie-electronic — they differ only in energy and tempo.

Style A — Grounded energy: indie electronic, uplifting male vocal, acoustic guitar + warm synth pads, ~95bpm, motivational, positive forward motion. Human feel. Not aggressive.
→ Choose A when the user needs: activation, breaking inertia, forward momentum, decisive action.

Style B — Calm focus: indie folk electronic, reflective male vocal, acoustic guitar, soft pads, ~80bpm, meditative, grounded, introspective. Still positive. Settling energy.
→ Choose B when the user needs: calm focus, deep work, organising thoughts, emotional grounding, steady momentum.

Include "style": "A" or "style": "B" in your JSON response.`;

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(pillar: PillarType, template: string): string {
  return `${LYRICS_SPEC}

PILLAR: ${pillar}
PILLAR TEMPLATE:
${template}

Return a JSON object with this exact shape:
{
  "pillar": "${pillar}",
  "style": "A",
  "title": "3–5 word song title",
  "stateSummary": {
    "state": "one sentence describing the user's current psychological state",
    "intent": "one sentence describing what they want to accomplish",
    "friction": "one sentence describing the specific block or resistance"
  },
  "lyrics": "full song lyrics with [VERSE]/[CHORUS]/[BRIDGE] structure, including a clear conclusive ending section"
}`;
}

// Style defaults per pillar (used in mock mode)
const PILLAR_STYLE_DEFAULTS: Record<PillarType, StyleChoice> = {
  Mode:         "B",
  Algorithm:    "A",
  Menu:         "A",
  Memorisation: "B",
  Mindset:      "B",
};

// ─── Mock outputs ─────────────────────────────────────────────────────────────

const MOCK_OUTPUTS: Record<PillarType, Omit<LLMResult, "pillar" | "style">> = {
  Mindset: {
    title: "Start Before You're Ready",
    stateSummary: {
      state: "Stuck in avoidance — circling the task without touching it.",
      intent: "Break through the resistance and make contact with the work.",
      friction: "The gap between sitting down and actually starting feels insurmountable.",
    },
    lyrics: `[VERSE]
Heavy. That's the word.
You've been here before — the same desk, the same open tab,
the same negotiation with the part of you that doesn't want to begin.
The task is real. The resistance is equally real.
Neither one wins just by existing.

[CHORUS]
But you've started harder things than this.
One breath. One line. One minute inside the work.
The gap closes only when you move —
not before you move, not after you decide to move.
When you move.

[BRIDGE]
You're in it now.
That's all it ever took.
Not courage. Not perfect conditions. Just contact.
You made contact. Stay here.`,
  },
  Mode: {
    title: "One Window Open",
    stateSummary: {
      state: "Ready to work but not yet locked in — hovering at the entry threshold.",
      intent: "Activate deep focus mode and eliminate distraction for a defined block.",
      friction: "Transition cost between open-world thinking and single-task execution.",
    },
    lyrics: `[VERSE]
Eyes forward. One task. Clock running.
Not everything — this.
The inbox doesn't exist right now.
The notifications are noise from another frequency.
This is the only channel open.

[CHORUS]
Enter the mode.
One window. One thread. One direction.
The work is the only signal —
everything else is interference you've already filtered.
Stay in it.

[BRIDGE]
You're locked.
Keep the thread.
Two hours. Go.
That's the whole instruction. That's enough.`,
  },
  Algorithm: {
    title: "First One Then Next",
    stateSummary: {
      state: "Inbox paralysis — avoidance building up over multiple days.",
      intent: "Execute a single pass through the backlog using a clear decision rule.",
      friction: "The pile feels large and unbounded — no clear entry point or exit condition.",
    },
    lyrics: `[VERSE]
Inbox. Start here.
Not the whole pile — the first one.
Open it. Read it once.
One read is enough to know what it needs.

[CHORUS]
Decide: reply, defer, or delete.
Do it now. Move to the next.
No second reads. No maybe folder.
No weight-carrying.
The rule is the algorithm — follow it until it's empty.

[BRIDGE]
Done. That's the inbox.
Not a feeling — a completed pass.
The pile is gone. You followed the rule.
Same rule tomorrow. Same result.`,
  },
  Menu: {
    title: "Pick One and Go",
    stateSummary: {
      state: "Paralysed by too many equally weighted options with no external forcing function.",
      intent: "Collapse the option space and commit to one path forward.",
      friction: "All options feel equal — no pressure is resolving the choice.",
    },
    lyrics: `[VERSE]
Two roads. You've been standing at this fork long enough
that the standing has become its own kind of motion —
convincing movement while nothing moves.
Deciding not to choose is still a decision.
It just doesn't belong to you.

[CHORUS]
Option one: start small, iterate fast.
Option two: go large, adjust in motion.
Option three: ask someone who has already been here.
Option four: wait — but name a date and name a trigger.
Pick one. Right now.

[BRIDGE]
You can change it. That's allowed.
But you have to be somewhere before you can change direction.
Go.
The road doesn't ask if you're sure. It only asks if you're moving.`,
  },
  Memorisation: {
    title: "Say It Out Loud",
    stateSummary: {
      state: "Surface familiarity without recall depth — recognising without retrieving.",
      intent: "Lock the sequence into working memory through rhythmic active repetition.",
      friction: "Trying to remember passively; no encoding structure in place.",
    },
    lyrics: `[VERSE]
Say it out loud. First time.
Not in your head — out loud, in sequence, one item per beat.
The voice anchors what the eye slides over.
No skipping. No shortcuts.
The first pass is always rough — that's the pass.

[CHORUS]
Group the first three. Say them faster.
Group the next three. Say them together.
You're not reading — you're building a structure in the brain
that retrieval can follow back.

[BRIDGE]
All of it. One breath.
You have it.
Not perfectly — but you have it.
That rough first pass was the work. Lock it.`,
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────

export async function interpret(transcript: string): Promise<LLMResult> {
  const pillar = detectPillar(transcript);

  if (USE_MOCK) {
    await delay(1200 + Math.random() * 600);
    return { pillar, style: PILLAR_STYLE_DEFAULTS[pillar], ...MOCK_OUTPUTS[pillar] };
  }

  const client = new Anthropic();
  const template = loadTemplate(pillar);
  const systemPrompt = buildSystemPrompt(pillar, template);

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `User's spoken state:\n"${transcript}"\n\nIdentify the pillar, summarise their state, and write the rhythm song lyrics.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  let parsed: LLMResult;
  try {
    const raw = textBlock.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned unparseable JSON: ${textBlock.text.slice(0, 200)}`);
  }

  return parsed;
}
