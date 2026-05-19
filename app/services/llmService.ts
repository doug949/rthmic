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
- Never use double-quote characters (") inside lyric lines — use single quotes or rewrite to avoid them

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
  Invite:       "A", // arresting, forward energy — makes them stop and listen
  Journal:      "B", // warm, reflective, acoustic — end-of-day feeling
  Epiphany:     "A", // electric, excited — the energy of a spark landing
  Explain:      "B", // calm, clear, unhurried — optimised for comprehension not atmosphere
  BookSummary:  "B", // same as Explain — clear, confident, the energy of a good recommendation
};

// ─── Mock outputs ─────────────────────────────────────────────────────────────

const MOCK_OUTPUTS: Record<PillarType, Omit<LLMResult, "pillar" | "style">> = {
  Memory: {
    title: "Link to Link",
    stateSummary: {
      state: "You're trying to hold a sequence in your head but the items aren't connecting — each one feels separate and slippery.",
      intent: "You want to encode the chain so that one item automatically pulls the next.",
      friction: "You're memorising items in isolation; there's no bridge between them for retrieval to follow.",
    },
    lyrics: `[VERSE]
Start where you already stand.
The first one is solid — you know it.
That's your anchor. That's the ground.
Everything else hangs off what you already have.

Now look at the second one.
Not the whole word — the beginning.
What does the start of it say?
What do those first letters remind you of?
Say it. Hear it. Let it land.

[CHORUS]
Link to link to link.
Each one holds the next.
You don't memorise the list —
you follow the chain.

[VERSE 2]
The ending of one word
is often the beginning of the next.
Or the sound shifts just enough
to suggest something you already know.

Find the fragment that fits.
Spell it out. Say it loud.
The bridge between them is already there —
you just have to notice it.

[BRIDGE]
This is the one that doesn't come easy.
This is the link that keeps breaking.
So make it bigger. Make it stranger.
Give it a colour, a weight, a sound.
The stranger the bridge — the harder it holds.

[OUTRO]
First one. Anchor.
Second one — through the bridge.
Third. Fourth. Fifth.
Follow the chain.
You built it. Now run it.
Link to link to link.`,
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
  Invite: {
    title: "Tell Me What You Find",
    stateSummary: {
      state: "You want to invite someone specific to beta test RTHMIC — someone whose honest experience you'd trust.",
      intent: "You want them to understand what RTHMIC is, know that this song proves it, and feel genuinely welcome to respond however they actually respond.",
      friction: "You need the invitation to be clear and direct without feeling like a pitch.",
    },
    lyrics: `[VERSE]
[Recipient's name].

I made an app.
It's called RTHMIC.
Here's what it does —
you describe the state you're in right now,
and it builds you a song.
Not a playlist. Not a suggestion.
A song. For that specific moment.
Stuck before something. Overwhelmed.
Trying to get moving. Trying to remember.
You speak. RTHMIC generates a Rthm.

[CHORUS]
This song you're listening to right now —
I made it using RTHMIC.
Someone described wanting to invite you to try it.
And this is what came out.
That's the concept. You just heard it work.

[VERSE 2]
It's a beta.
Still being built. Not finished.
I've been using it myself the whole time
I've been making it — and it does something real.
But I don't know yet whether that's just me.

Which is where you come in.

[BRIDGE]
Try it for a few days.
Pay attention to what actually happens.
Love it — I want to know.
Hate it — I want to know.
Find it strange, don't get it, feel nothing —
all of that is useful.
The only thing that doesn't help me
is a polite non-answer.

[OUTRO]
There's no right response here.
Your honest experience is the experiment.
Tell me what you find.`,
  },
  Explain: {
    title: "Here's How It Works",
    stateSummary: {
      state: "There's something that hasn't fully clicked for you — a concept, a system, an idea you've come across before but never quite grasped.",
      intent: "You want to finish listening and think: I get it now. Not just the surface of it — the actual structure underneath.",
      friction: "You've heard explanations before, but the framing hasn't been right. Something about the way it's been presented hasn't made the shape of it visible.",
    },
    lyrics: `[VERSE]
Here's the thing.
Not the whole thing — the core of it.
The part that, once you have it, makes the rest make sense.
Start there. Everything else builds from that.

There's a shape to this idea.
Three parts, or maybe two.
One thing leads to the next.
Follow the sequence and you'll see why it works.

[CHORUS]
This is how it works.
Not complicated — just sequential.
One piece at a time.
By the end of the song you'll have it.

[VERSE 2]
The part most people miss:
it's not about memorising the steps.
It's about seeing the logic underneath them.
Once you see why, you'll never need to be told what again.

Here's an example — a real one, not an abstract one.
You've probably seen something like this before.
That's the connection. That's the bridge.
What you already know is the way in.

[BRIDGE]
Questions are good here.
If it's not clear yet, that's information.
The place it stops making sense
is the exact place we need to look.

[OUTRO]
You have it now.
Not just the surface — the structure underneath.
That's what stays.
That's what you came here for.`,
  },
  Epiphany: {
    title: "Write It Before It Goes",
    stateSummary: {
      state: "You've just had a sharp, clear idea — the kind that feels obvious the moment it arrives but slips if you don't catch it.",
      intent: "You want to lock it in place before the clarity fades, in a form that will still carry its meaning later.",
      friction: "Ideas are fragile. The feeling of understanding is not the same as having captured the understanding.",
    },
    lyrics: `[VERSE]
It just came to you.
Not from searching — from somewhere else.
The kind of thought that shows up fully formed
and says: you have exactly this long to catch me.

Write it down.
Not the summary. The real thing.
The part that surprised you — write that first.
The part that doesn't fit the way you already thought — write that especially.

[CHORUS]
The idea is here right now.
It won't feel this clear in an hour.
The shape of it is sharp right now.
Don't paraphrase. Don't wait. Write it now.

[VERSE 2]
There's a version of this you already half-believe.
And there's the part that broke that version open.
That break is the thing.
That's where the new understanding lives.

What does this change?
What does it now make possible?
What did you think before that you no longer think?
Say that. Exactly that.

[BRIDGE]
You don't have to know what to do with it yet.
You just have to get it out of the air
and into a form that has weight.
Words. A diagram. Whatever it takes.

The idea isn't safe in your head.
Your head will revise it before morning
into something more comfortable and less true.

[OUTRO]
Write it before it goes.
Write the version that surprised you.
Write the thing you aren't sure you believe yet.
That's the one worth keeping.`,
  },
  BookSummary: {
    title: `Tiny Things, Big Change — Summary of "Atomic Habits" by James Clear`,
    stateSummary: {
      state: "You want to understand the core idea from Atomic Habits — the one thing the book is actually saying.",
      intent: "You want to finish listening and be able to explain it to someone else.",
      friction: "Most book summaries give you a chapter list. This gives you the idea.",
    },
    lyrics: `[VERSE]
You don't rise to the level of your goals.
You fall to the level of your systems.
That's the thing James Clear is saying.
Goals are temporary. Systems are what stay.

Everyone wants to get fit or write every day.
But wanting isn't what makes it happen.
What makes it happen is what you built into your life
when no one was watching and nothing felt urgent.

[CHORUS]
Atomic Habits.
Small actions. Compound effect.
One percent better every single day
is 37 times better by the end of the year.

[VERSE 2]
Every habit has four parts —
cue, craving, response, reward.
That's the loop. That's the machine.
Change the cue and you change the loop.

Make it obvious. Make it attractive.
Make it easy. Make it satisfying.
The book isn't telling you to try harder.
It's telling you to design smarter.

[BRIDGE]
Here's the counterintuitive part:
identity comes after the behaviour, not before.
You don't become a runner then start running.
You start running and then become a runner.

Cast votes for the person you want to be.
One rep. One page. One minute.
The habit is proof.
The proof builds the identity.

[OUTRO]
Tiny actions.
Trusted systems.
You don't need to change who you are.
You need to change what you repeatedly do.`,
  },
  Journal: {
    title: "Saturday, May 10th",
    stateSummary: {
      state: "You're at the end of a day and you want to capture it — the events, the feelings, the things you might forget.",
      intent: "You want to keep the day in a form that will still carry meaning when you return to it.",
      friction: "Days disappear. The small things go first — the conversation, the quiet moment, the thing that surprised you.",
    },
    lyrics: `[VERSE]
You woke up before you were ready.
The morning was slow — slower than you wanted it to be.
There was that thing you kept putting off.
It sat there the whole day, not quite urgent, not quite done.

You talked to someone and they said something
that stayed with you longer than you expected.
You're not sure if it was good or just honest.
Maybe both.

[CHORUS]
You were in it.
The whole complicated day of it.
Not all of it made sense.
Not all of it had to.

[VERSE 2]
Sometime in the afternoon something shifted —
you can't say exactly when.
A small thing. Someone's expression.
The light coming through a window at a certain angle.

You almost didn't notice.
But you're saying it now, so now it's kept.

[BRIDGE]
There were parts of today you wouldn't choose again.
There were parts you wanted more of.
Neither of those things cancels the other.
That's just how today was.

[OUTRO]
The day is done.
You spoke it out before it could disappear.
Play this back when you've forgotten what this felt like.
It's kept now.`,
  },
};

// ─── JSON extraction ──────────────────────────────────────────────────────────
//
// Claude may format its response in several ways that break a naive JSON.parse:
//   • Wrap the object in a ```json … ``` code fence
//   • Include a sentence of prose before or after the fence
//   • Embed literal newline / carriage-return chars inside string values
//     (lyrics are multiline; JSON requires them escaped as \n)
//
// We try increasingly tolerant strategies:
//   1. Strip code fence → sanitize newlines in strings → parse
//   2. Extract outermost { … } block → sanitize → parse
//   3. Throw so the caller can surface the raw text in the error message

/**
 * Fix literal newlines/carriage-returns inside JSON string values.
 * Works by walking the string character-by-character, tracking whether
 * we're inside a quoted value, and escaping bare newlines we find there.
 */
function sanitizeJsonStrings(raw: string): string {
  let out = "";
  let inStr = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }

    if (inStr) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }

    out += ch;
  }

  return out;
}

function extractJson(text: string): LLMResult {
  // Strategy 1 — strip code fence (handles fence anywhere in the string)
  const fenceStripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(sanitizeJsonStrings(fenceStripped)) as LLMResult;
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2 — extract the outermost { … } block and sanitize
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(sanitizeJsonStrings(text.slice(start, end + 1))) as LLMResult;
    } catch {
      // fall through to throw
    }
  }

  throw new Error("Could not extract JSON from LLM response");
}

// ─── Invite: spelled-name normalisation ──────────────────────────────────────
//
// Users often spell out recipient names when speaking (e.g. "K-A-T-H" or "K A T H").
// Whisper transcribes these as isolated letters. We reconstruct them before the
// LLM sees the text so the transcript contains "Kath" not "K-A-T-H".
//
// Patterns caught:
//   • Dash-separated:  K-A-T-H  →  Kath
//   • Space-separated: K A T H  (two or more single-letter tokens)  →  Kath
// Only uppercase single letters — avoid false positives with abbreviations.

function reconstructSpelledNames(text: string): string {
  // Pass 1: dash-separated sequences like K-A-T-H-Y  (2+ letters)
  let result = text.replace(
    /\b([A-Z])(?:-[A-Z]){1,}\b/g,
    (match) => {
      const letters = match.split("-").join("");
      return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    },
  );

  // Pass 2: space-separated single uppercase letters like K A T H
  // Must be at least 2 consecutive single-letter tokens to trigger.
  result = result.replace(
    /(?<!\S)([A-Z])(?:\s+([A-Z])){1,}(?!\S)/g,
    (match) => {
      const letters = match.replace(/\s+/g, "");
      return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    },
  );

  return result;
}

// ─── User prompt builder ──────────────────────────────────────────────────────

function formatJournalDate(): string {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];
  const day = days[now.getDay()];
  const month = months[now.getMonth()];
  const date = now.getDate();
  const suffix = date === 1 || date === 21 || date === 31 ? "st"
               : date === 2 || date === 22 ? "nd"
               : date === 3 || date === 23 ? "rd" : "th";
  return `${day}, ${month} ${date}${suffix}`;
}

function buildUserPrompt(pillar: PillarType, transcript: string): string {
  const base = `User's spoken state:\n"${transcript}"\n\nThe pillar is already determined: ${pillar}. Summarise the user's state in second person (use "you"/"you're", not "the user") and write the rhythm song lyrics for the ${pillar} pillar.`;

  if (pillar === "Journal") {
    const dateStr = formatJournalDate();
    return `${base}\n\nToday's date: ${dateStr}. The song title MUST use this date (e.g. "${dateStr}" or "${dateStr.split(",")[0]} Morning, ${dateStr.split(", ")[1]}"). Do not use a poetic title instead.`;
  }

  if (pillar === "BookSummary") {
    return `${base}\n\nThe song title MUST follow this exact format: [Poetic Song Name] — Summary of "[Book Title]" by [Author Name]. Generate a short evocative song name (3–5 words) first, then append the book attribution. Extract the book title and author from the user's transcript. Example: "Tiny Things, Big Change — Summary of \\"Atomic Habits\\" by James Clear". Do not omit the attribution.\n\nIMPORTANT: The author's name MUST appear naturally in the first verse — embedded as part of the lyric, not a label. Use a phrase like "[Author] argues that…", "[Author] shows that…", or "As [Author] puts it…". This gives the author credit and grounds the song in the source.`;
  }

  return base;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function interpret(rawTranscript: string, overridePillar?: PillarType): Promise<LLMResult> {
  // User-selected pillar takes priority over auto-detection
  const pillar = overridePillar ?? detectPillar(rawTranscript);

  // For Invite: reconstruct any spelled-out names before the LLM sees the transcript
  // (e.g. "K-A-T-H" → "Kath" so the lyrics never contain letter-by-letter spellings)
  const transcript = pillar === "Invite" ? reconstructSpelledNames(rawTranscript) : rawTranscript;

  if (USE_MOCK) {
    await delay(1200 + Math.random() * 600);
    return { pillar, style: PILLAR_STYLE_DEFAULTS[pillar], ...MOCK_OUTPUTS[pillar] };
  }

  const client = new Anthropic();
  const template = loadTemplate(pillar);
  const master = loadMaster();
  const systemPrompt = buildSystemPrompt(pillar, template, master);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserPrompt(pillar, transcript),
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }

  const fullText = textBlock.text;

  let parsed: LLMResult;
  try {
    parsed = extractJson(fullText);
  } catch {
    throw new Error(`LLM returned unparseable JSON: ${fullText.slice(0, 200)}`);
  }

  // Always enforce the pillar we determined — never let the LLM override it
  parsed.pillar = pillar;

  return parsed;
}
