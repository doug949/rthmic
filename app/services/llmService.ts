// llmService
// USE_MOCK = true → returns pre-written outputs keyed by pillar (no API cost).
// Set USE_MOCK = false to use Claude (claude-opus-4-7) for real interpretation.

import Anthropic from "@anthropic-ai/sdk";
import { detectPillar, loadTemplate } from "@/app/lib/templateEngine";
import type { PillarType, StateSummary } from "@/app/types/pipeline";

const USE_MOCK = false; // uses Claude claude-opus-4-7 via ANTHROPIC_API_KEY

export interface LLMResult {
  pillar: PillarType;
  stateSummary: StateSummary;
  titleA: string;   // title for the direct/motivational version
  titleB: string;   // title for the reflective/expansive version
  lyricsA: string;  // direct, minimal, motivational — pairs with Style A (upbeat pop)
  lyricsB: string;  // reflective, melodic, expansive — pairs with Style B (minimal house)
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
- Length: as long as needed to fully install the idea, up to 5000 characters per song

SONG ENDINGS (REQUIRED FOR BOTH SONGS):
- Every song must have a clear, conclusive closing section — no abrupt cuts
- The ending must resolve the emotional arc of the song
- Close with a memorable final line or an echo/resolution of a key earlier phrase
- The listener must feel the song is complete, not interrupted

SONG TITLES:
Each song gets its own title (3–5 words). The title names the operating mode or mindset being installed — not the user's problem. Poetic but concrete. No generic self-help.
Examples: "Start Before You're Ready", "One Window Open", "First One Then Next", "Say It Out Loud"

DUAL RHYTHM GENERATION (REQUIRED):
Generate TWO distinct rhythm songs from the same user state. They MUST differ significantly in tone, structure, and emotional register.

SONG A — Direct, Minimal, Motivational:
- Short, punchy lines. Decisive, active language.
- Energy-forward: activation, momentum, cutting through resistance
- Structure: tight verses, punchy chorus, concise overall
- Emotional register: confident, driven, immediate
- The listener should feel propelled into action
- Pairs with upbeat pop production (Style A)

SONG B — Reflective, Melodic, Expansive:
- Longer lines with imagery and metaphor
- Depth-forward: understanding, grounding, acceptance, meaning
- Structure: longer verses, more developed emotional arc
- Emotional register: considered, warm, resolved, spacious
- The listener should feel settled and clear
- Pairs with minimal house production (Style B)

The two songs must not feel like variations of the same song. They are two genuinely different lenses on the same state.`;

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(pillar: PillarType, template: string): string {
  return `${LYRICS_SPEC}

PILLAR: ${pillar}
PILLAR TEMPLATE:
${template}

Return a JSON object with this exact shape:
{
  "pillar": "${pillar}",
  "stateSummary": {
    "state": "one sentence describing the user's current psychological state",
    "intent": "one sentence describing what they want to accomplish",
    "friction": "one sentence describing the specific block or resistance"
  },
  "songA": {
    "title": "3–5 word title for the direct/motivational version",
    "lyrics": "full Song A lyrics with [VERSE]/[CHORUS]/[BRIDGE] structure, including a clear conclusive ending"
  },
  "songB": {
    "title": "3–5 word title for the reflective/expansive version",
    "lyrics": "full Song B lyrics with [VERSE]/[CHORUS]/[BRIDGE] structure, including a clear conclusive ending"
  }
}`;
}

// ─── Mock outputs ─────────────────────────────────────────────────────────────

const MOCK_OUTPUTS: Record<PillarType, Omit<LLMResult, "pillar">> = {
  Mindset: {
    titleA: "Start Before You're Ready",
    titleB: "The Weight Before Motion",
    stateSummary: {
      state: "Stuck in avoidance — circling the task without touching it.",
      intent: "Break through the resistance and make contact with the work.",
      friction: "The gap between sitting down and actually starting feels insurmountable.",
    },
    lyricsA: `[VERSE]
Heavy. That's the word.
Open the tab. Touch the work.
One line. One move. One breath.
The gap closes when you move.

[CHORUS]
Not before. Not after.
When you move.
Go.

[BRIDGE]
You're in it now.
That's all it ever took.
Stay.`,
    lyricsB: `[VERSE]
You've been here before — the same desk, the same open tab,
the same negotiation with the part of you that doesn't want to begin.
The task is real. The resistance is equally real.
Neither one wins just by existing.
But you've started harder things than this.

[CHORUS]
One breath. One line. One minute inside the work.
The gap closes only when you move —
not before you decide, not after you feel ready.
When you move. That's when it closes.

[BRIDGE]
You're in it now.
That's all it ever took — not courage, not perfect conditions.
Just the decision to be somewhere instead of nowhere.
Stay. The work will meet you here.`,
  },
  Mode: {
    titleA: "One Window Open",
    titleB: "Enter the Threshold",
    stateSummary: {
      state: "Ready to work but not yet locked in — hovering at the entry threshold.",
      intent: "Activate deep focus mode and eliminate distraction for a defined block.",
      friction: "Transition cost between open-world thinking and single-task execution.",
    },
    lyricsA: `[VERSE]
One task. Clock running.
Close everything else.
This is the only signal.

[CHORUS]
Enter the mode.
One window. One thread.
Stay in it.

[BRIDGE]
Locked.
Keep the thread.
Two hours. Go.`,
    lyricsB: `[VERSE]
Eyes forward. One task. The inbox doesn't exist right now.
The notifications are noise from another frequency.
This is the only channel open — everything else has been filtered
not because it doesn't matter, but because right now, this matters more.

[CHORUS]
Enter the mode.
One window. One thread. One direction.
The work is the only signal — everything else is interference you've already cleared.
You chose this. Stay in it.

[BRIDGE]
You're locked in. That's what this feels like — not forced, not restrained.
Chosen. Deliberate. Present.
Keep the thread until it's done.
Then you can return to everything else.`,
  },
  Algorithm: {
    titleA: "First One Then Next",
    titleB: "The Clear Pass",
    stateSummary: {
      state: "Inbox paralysis — avoidance building up over multiple days.",
      intent: "Execute a single pass through the backlog using a clear decision rule.",
      friction: "The pile feels large and unbounded — no clear entry point or exit condition.",
    },
    lyricsA: `[VERSE]
Inbox. First one. Open it.
One read. Decide: reply, defer, delete.
Do it. Next.

[CHORUS]
No second reads. No maybe folder.
The rule is the algorithm.
Follow it until it's empty.

[BRIDGE]
Done. That's the inbox.
Not a feeling — a completed pass.
Same time tomorrow.`,
    lyricsB: `[VERSE]
Inbox. Start here — not with the whole pile, just the first one.
Open it. Read it once. One read is enough to know what it needs.
You already know what most of these want from you.
The pile only feels large because you're looking at all of it at once.

[CHORUS]
Decide: reply, defer, or delete. Do it now. Move to the next.
No second reads. No maybe folder. No weight-carrying into tomorrow.
The rule is the algorithm — follow it until the inbox is empty.
That's the only exit condition. One item at a time until it's done.

[BRIDGE]
Done. That's what it feels like — not triumph, just completion.
The inbox is not a measure of your worth. It's a queue.
You've cleared the queue. It will fill again.
And next time you'll know exactly what to do.`,
  },
  Menu: {
    titleA: "Pick One and Go",
    titleB: "Collapse the Fork",
    stateSummary: {
      state: "Paralysed by too many equally weighted options with no external forcing function.",
      intent: "Collapse the option space and commit to one path forward.",
      friction: "All options feel equal — no pressure is resolving the choice.",
    },
    lyricsA: `[VERSE]
Two roads. Standing at the fork.
Deciding not to choose is still a choice.
Pick one. Right now.

[CHORUS]
Start small. Iterate fast.
Go large. Adjust in motion.
Ask someone. Wait with a date.
One. Pick one.

[BRIDGE]
You can change it.
But you have to be somewhere first.
Go.`,
    lyricsB: `[VERSE]
Two roads. You've been standing at this fork long enough
that the standing has become its own kind of motion —
convincing movement while nothing moves.
Deciding not to choose is still a decision. It just doesn't belong to you.

[CHORUS]
Option one: start small, iterate fast.
Option two: go large, adjust in motion.
Option three: ask someone who has already been here.
Option four: wait — but name a date and name a trigger.
Pick one. Not the best one — just one that you can start.

[BRIDGE]
You can change it. That's always been allowed.
But you have to be somewhere before you can change direction.
The road doesn't ask if you're sure.
It only asks if you're moving.
Go.`,
  },
  Memorisation: {
    titleA: "Say It Out Loud",
    titleB: "Build the Structure",
    stateSummary: {
      state: "Surface familiarity without recall depth — recognising without retrieving.",
      intent: "Lock the sequence into working memory through rhythmic active repetition.",
      friction: "Trying to remember passively; no encoding structure in place.",
    },
    lyricsA: `[VERSE]
Out loud. First time.
Not in your head — out loud.
One item per beat. No skipping.

[CHORUS]
Group the first three. Say them faster.
Group the next three. Together.
You're building a structure.
Retrieval can follow it back.

[BRIDGE]
All of it. One breath.
You have it. Lock it.`,
    lyricsB: `[VERSE]
Say it out loud. First time — rough, hesitant, incomplete.
That's the pass. The voice anchors what the eye slides over.
You're not reading anymore. You're building something in the brain
that retrieval can follow back when you need it.

[CHORUS]
Group the first three. Say them faster — let the rhythm carry them.
Group the next three. Say them together like they belong together, because they do.
You're not memorising a list. You're constructing a path
that exists in your memory as a walkable sequence.

[BRIDGE]
All of it. One breath. From the beginning without looking.
You have it — not perfectly, but you have it.
That rough first pass was the work.
Everything after this is just reinforcement.
Lock it.`,
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────

export async function interpret(transcript: string): Promise<LLMResult> {
  const pillar = detectPillar(transcript);

  if (USE_MOCK) {
    await delay(1200 + Math.random() * 600);
    return { pillar, ...MOCK_OUTPUTS[pillar] };
  }

  // Real Claude call
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const template = loadTemplate(pillar);
  const systemPrompt = buildSystemPrompt(pillar, template);

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `User's spoken state:\n"${transcript}"\n\nIdentify the pillar, summarise their state, and write both rhythm songs (A and B).`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  let parsed: {
    pillar: PillarType;
    stateSummary: StateSummary;
    songA: { title: string; lyrics: string };
    songB: { title: string; lyrics: string };
  };

  try {
    const raw = textBlock.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned unparseable JSON: ${textBlock.text.slice(0, 200)}`);
  }

  return {
    pillar: parsed.pillar,
    stateSummary: parsed.stateSummary,
    titleA: parsed.songA.title,
    titleB: parsed.songB.title,
    lyricsA: parsed.songA.lyrics,
    lyricsB: parsed.songB.lyrics,
  };
}
