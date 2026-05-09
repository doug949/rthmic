// llmService
// USE_MOCK = true → returns pre-written outputs keyed by pillar (no API cost).
// Set USE_MOCK = false to use Claude (claude-opus-4-7) for real interpretation.

import Anthropic from "@anthropic-ai/sdk";
import { detectPillar, loadTemplate, loadMaster } from "@/app/lib/templateEngine";
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

function buildSystemPrompt(pillar: PillarType, template: string, masterContext?: string): string {
  const masterSection = masterContext
    ? `\nSYSTEM:\n${masterContext}\n`
    : "";

  return `${LYRICS_SPEC}
${masterSection}
PILLAR: ${pillar}

${template}

Return a JSON object with this exact shape:
{
  "pillar": "${pillar}",
  "style": "A",
  "title": "3–5 word song title",
  "stateSummary": {
    "state": "one sentence describing the person's current psychological state — write in second person, e.g. 'You seem to be...' or 'You're feeling...'",
    "intent": "one sentence describing what they want to accomplish — write in second person, e.g. 'You want to...' or 'You're trying to...'",
    "friction": "one sentence describing the specific block or resistance — write in second person, e.g. 'What's stopping you is...' or 'You're finding it hard to...'"
  },
  "lyrics": "full song lyrics with [VERSE]/[CHORUS]/[BRIDGE] structure, including a clear conclusive ending section"
}`;
}

// Style defaults per pillar (used in mock mode)
// A = grounded energy / activation, B = calm focus / settling
const PILLAR_STYLE_DEFAULTS: Record<PillarType, StyleChoice> = {
  Memory:       "B", // warm, melodic, unhurried
  Menus:        "B", // ambient, gentle, looping
  Mindset:      "B", // calm upward trajectory
  Mode:         "B", // quick interruption → settling
  Movement:     "A", // rhythmic forward momentum
  Understanding: "B", // patient, clear, unhurried
  Bridge:       "B", // warm, intimate, emotionally resonant
};

// ─── Mock outputs ─────────────────────────────────────────────────────────────

const MOCK_OUTPUTS: Record<PillarType, Omit<LLMResult, "pillar" | "style">> = {
  Memory: {
    title: "Say It Out Loud",
    stateSummary: {
      state: "You have the information but it isn't sticking — recognition without retrieval.",
      intent: "You want to encode the sequence so it's available under real conditions.",
      friction: "You're reading passively; there's no structure to hang the information on.",
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
That rough first pass was the work. Lock it.

[OUTRO]
One more time. Start again.
Each pass is easier than the last.
The structure holds. You built it.`,
  },
  Menus: {
    title: "Options in the Air",
    stateSummary: {
      state: "You're looking at too many tasks and none of them feel like a clear place to start.",
      intent: "You want a way to move through your list without the weight of obligation.",
      friction: "Everything feels equally important — and equally heavy.",
    },
    lyrics: `[VERSE]
Morning light, open window.
You could start with something small.
You could clear the one thing that's been sitting there.
Or you could leave it for the afternoon.

[CHORUS]
There's no right order. There's just what calls.
Maybe this. Maybe that.
One thing chosen is one thing done.
The rest can wait their turn.

[VERSE 2]
Afternoon — you're in it now.
There's the message you could send.
There's the file you could finish.
There's the call you've been putting off.

[CHORUS]
There's no right order. There's just what calls.
Maybe this. Maybe that.
One thing chosen is one thing done.
The rest can wait their turn.

[OUTRO]
Nothing on this list is chasing you.
Pick one. Begin.
The list will still be here — and so will you.`,
  },
  Mindset: {
    title: "You Are Moving Into This",
    stateSummary: {
      state: "You're in the space before something important — not yet in it, not quite settled.",
      intent: "You want to arrive at the moment feeling prepared and grounded.",
      friction: "The gap between now and then feels uncertain and exposed.",
    },
    lyrics: `[VERSE]
Breathe. You are here before it begins.
Not inside it yet — just here.
This is the place you always come back from.
You have been in rooms like this before.

[CHORUS]
You are moving into this.
Not away from it. Into it.
Whatever opens when the moment comes —
you can meet it.

[VERSE 2]
You know more than you think you know.
You have prepared more than you remember.
The nerves are part of the signal — not the problem.
Let them run. They don't run the room.

[CHORUS]
You are moving into this.
Not away from it. Into it.
Whatever opens when the moment comes —
you can meet it.

[OUTRO]
When the door opens — walk in.
You are already there.`,
  },
  Mode: {
    title: "Stop Here",
    stateSummary: {
      state: "You're caught in a spiral — the feeling is running fast and you can't find the edge of it.",
      intent: "You want it to slow down enough that you can get your footing back.",
      friction: "The intensity is making it hard to locate anything steady.",
    },
    lyrics: `[VERSE]
Stop here.
Not to fix it. Just to stop.
The thing that's running — let it run in place.
You don't have to chase it.

[CHORUS]
Feet on the floor. That's real.
Hands in your lap. That's real.
The room is still around you.
You are in it. That's enough.

[VERSE 2]
The feeling is loud. That's okay.
Loud things pass.
You don't have to argue with it —
just let it move through the room.

[CHORUS]
Feet on the floor. That's real.
Hands in your lap. That's real.
The room is still around you.
You are in it. That's enough.

[OUTRO]
Slower now. You're still here.
The ground hasn't moved.
You're still on it.`,
  },
  Movement: {
    title: "Keep the Thread",
    stateSummary: {
      state: "You're stuck — not in crisis, but in friction. The thing you need to do isn't moving.",
      intent: "You want to get inside the work and stay there long enough to find momentum.",
      friction: "The start keeps not happening. Each pause makes the next start harder.",
    },
    lyrics: `[VERSE]
One step. Just one.
Not the whole thing — the first inch.
The groove starts small.
It always starts small.

[CHORUS]
Keep the thread.
Don't drop the thread.
One thing follows the next thing —
let it follow.

[VERSE 2]
You were moving. You can be moving again.
The ground is the same ground.
The work is the same work.
You just have to put your hands on it.

[CHORUS]
Keep the thread.
Don't drop the thread.
One thing follows the next thing —
let it follow.

[BRIDGE]
Still here. Still going.
The rhythm finds you if you stay in it.
Stay in it.

[OUTRO]
Keep the thread.
Keep the thread.
Keep going.`,
  },
  Understanding: {
    title: "One Clear Model",
    stateSummary: {
      state: "You're close to understanding something but it keeps slipping — you can feel the shape without the grip.",
      intent: "You want it to become simple enough that you could explain it to someone else.",
      friction: "There's too much coming in at once and no single frame to organise it around.",
    },
    lyrics: `[VERSE]
Start with what you know for certain.
One thing you can put down without doubt.
That's the floor. Build from there.
Don't try to hold the ceiling yet.

[CHORUS]
One model. Clear and simple.
Not the whole thing — the shape of it.
Once you have the shape —
the rest has somewhere to go.

[VERSE 2]
First part: what it is.
Second part: what it does.
Third part: why it matters.
That's the frame. Hang the rest on it.

[CHORUS]
One model. Clear and simple.
Not the whole thing — the shape of it.
Once you have the shape —
the rest has somewhere to go.

[OUTRO]
Say it back in your own words.
If you can say it — you have it.
That's the signal.`,
  },
  Bridge: {
    title: "This Is For You",
    stateSummary: {
      state: "You have something you want to say to someone — something warm, something real, something that's hard to say directly.",
      intent: "You want them to feel it, to know you were thinking of them specifically.",
      friction: "Words alone don't carry the weight. You want something they can hold.",
    },
    lyrics: `[VERSE]
This one's for you.
Not for anyone else — just you.
I thought about what I wanted to say
and I couldn't find the words on their own.
So I made this instead.

[CHORUS]
I want you to hear something.
Not advice. Not instructions.
Just — I see you.
And I wanted you to know that.

[VERSE 2]
I don't know what today's been like.
But I know you. And I know this is for you.
So press play when you're ready.
This isn't going anywhere.

[CHORUS]
I want you to hear something.
Not advice. Not instructions.
Just — I see you.
And I wanted you to know that.

[OUTRO]
This was made for you.
All of it.`,
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────

export async function interpret(transcript: string, overridePillar?: PillarType): Promise<LLMResult> {
  // User-selected pillar takes priority over auto-detection
  const pillar = overridePillar ?? detectPillar(transcript);

  if (USE_MOCK) {
    await delay(1200 + Math.random() * 600);
    return { pillar, style: PILLAR_STYLE_DEFAULTS[pillar], ...MOCK_OUTPUTS[pillar] };
  }

  const client = new Anthropic();
  const template = loadTemplate(pillar);
  const master = loadMaster();
  const systemPrompt = buildSystemPrompt(pillar, template, master);

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `User's spoken state:\n"${transcript}"\n\nIdentify the pillar, summarise their state in second person (use "you"/"you're", not "the user"), and write the rhythm song lyrics.`,
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
