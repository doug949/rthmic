// GET /api/suggestions?pillar=<pillar>
// Generates 6 fresh topic suggestions via Claude Haiku, guided by the
// user's existing library so it avoids repeats but stays on-theme.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";

export const maxDuration = 20;

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

async function getPastTitles(uid: string, pillar: string): Promise<string[]> {
  if (!process.env.REDIS_URL) return [];
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    const raw = await client.get(`lib:${uid}`);
    if (!raw) return [];
    const rhythms: SavedRhythm[] = JSON.parse(raw);
    return rhythms
      .filter((r) => r.pillar?.toLowerCase() === pillar.toLowerCase() && r.status !== "deleted")
      .map((r) => r.title)
      .slice(0, 30); // cap context to avoid huge prompts
  } finally {
    await client.disconnect();
  }
}

const CHALLENGE_STARTERS: Record<string, string[]> = {
  memory: [
    "My spouse's phone number",
    "Names from a networking event",
    "Strings on a musical instrument",
    "Six Croatian words",
    "A short speech",
    "A process sequence",
    "A passcode I keep forgetting",
    "The order of a checklist",
    "Key client names",
    "Exam definitions",
    "A route with turns",
    "Parts of a diagram",
  ],
  mindset: [
    "I have two hours to finish",
    "I'm walking into a party alone",
    "I'm going for a job interview",
    "I'm going on a date",
    "I'm about to give a speech",
    "I'm making an important purchase",
    "I'm entering a difficult meeting",
    "I'm starting a negotiation",
    "I'm about to make a sales call",
    "I'm going to a medical appointment",
    "I'm sitting an exam today",
    "I'm asking for something important",
  ],
  mode: [
    "I just had an awkward confrontation",
    "I'm anxious about last night",
    "I'm resenting something",
    "I'm replaying what I said",
    "I'm stuck in a shame spiral",
    "I feel defensive and tense",
    "I can't stop overthinking it",
    "I'm carrying Sunday dread",
    "I feel socially hungover",
    "I'm irritated and can't drop it",
    "I feel embarrassed about earlier",
    "I'm bracing for bad news",
  ],
  movement: [
    "I've been avoiding this task",
    "I don't know where to start",
    "This never reaches my to-do list",
    "I need to open the email",
    "The room is too messy",
    "I've delayed this for weeks",
    "I need to start the application",
    "The admin pile is growing",
    "I keep postponing the workout",
    "I need to clear the kitchen",
    "The project needs a restart",
    "I feel overwhelmed by options",
  ],
};

function sampleStarters(pillar: string, past: string[]) {
  const starters = CHALLENGE_STARTERS[pillar];
  if (!starters) return null;
  const pastSet = new Set(past.map((title) => title.toLowerCase()));
  const available = starters.filter((starter) => !pastSet.has(starter.toLowerCase()));
  const pool = available.length >= 6 ? available : starters;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
}

function buildPrompt(pillar: string, past: string[]): string {
  const hasPast = past.length > 0;
  const pastList = hasPast ? past.map((t) => `- ${t}`).join("\n") : "";

  if (pillar === "booksummary") {
    return hasPast
      ? `You are suggesting books for someone who turns book summaries into personalised music Rthms.
They have already made Rthms from these books:
${pastList}

Suggest 6 books that would make great Rthms next. Be guided by their taste — similar themes, genres, or authors — but do not repeat any book they have already done. Vary the suggestions across non-fiction, philosophy, psychology, business, science, and memoir.

Return ONLY a valid JSON array of 6 book titles. No explanation, no markdown, no extra text.`
      : `Suggest 6 books that would make great personalised music Rthms. Include a varied mix: non-fiction, philosophy, psychology, business, science, memoir. Popular and accessible, not too obscure.

Return ONLY a valid JSON array of 6 book titles. No explanation, no markdown, no extra text.`;
  }

  if (pillar === "explain") {
    return hasPast
      ? `You are suggesting concepts for someone who turns concept explanations into personalised music Rthms.
They have already made Rthms explaining these concepts:
${pastList}

Suggest 6 fascinating concepts to explain next. Be guided by their intellectual interests — adjacent ideas, related fields — but do not repeat anything they have already covered. Keep concepts crisp and nameable (2–5 words max each).

Return ONLY a valid JSON array of 6 concept names. No explanation, no markdown, no extra text.`
      : `Suggest 6 fascinating concepts that would make great personalised music Rthms. Mix mental models, science, psychology, economics, and philosophy. Keep each concept crisp and nameable (2–5 words max).

Return ONLY a valid JSON array of 6 concept names. No explanation, no markdown, no extra text.`;
  }

  const pillarBriefs: Record<string, string> = {
    memory: "concrete lists, sequences, names, numbers, phrases, or labels the user needs to memorise accurately",
    menus: "daily menus that are options to consider, not to-do lists",
    mindset: "upcoming situations, events, or decisions the user is about to walk into and wants the right mindset for",
    mode: "unhelpful states the user is already in and wants to shake off, reset, or move through",
    movement: "avoided, stalled, overwhelming, or repeatedly postponed tasks the user needs help starting",
    journal: "moments from the day worth capturing as a personal song",
    epiphany: "fresh realisations, ideas, or insights worth preserving",
    bridge: "personal messages made for someone else",
    invite: "specific people to invite into RTHMIC through a song",
  };
  const brief = pillarBriefs[pillar] ?? "useful personalised Rthm starting points";

  const extraGuidance: Record<string, string> = {
    memory: "Return things like phone numbers, names from a networking event, musical instrument strings, speeches, passcodes, language words, process steps, checklist orders, formulas, or labelled parts. Do NOT suggest emotional states or abstract recovery phrases.",
    mindset: "Return first-person upcoming situations like job interview, first date, important purchase, giving a speech, difficult meeting, performance review, sales call, medical appointment, negotiation, or exam. Do NOT return advice phrases.",
    mode: "Return first-person current states to shift out of, such as awkward confrontation aftermath, anxiety about last night, resentment, shame spiral, post-argument replay, Sunday dread, social hangover, or feeling defensive. Do NOT return aspirational modes like deep focus.",
    movement: "Return stuck-task situations, such as avoiding admin, overwhelmed and don't know where to start, task never reaches the top of the list, messy room, unopened email, delayed application, postponed workout, or project restart.",
  };
  const guidance = extraGuidance[pillar] ? `\n${extraGuidance[pillar]}` : "";

  return hasPast
    ? `You are suggesting starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
The user has already made these Rthms:
${pastList}

Suggest 6 concise starting points they might want to make next. Avoid repeats. Make them practical, specific, and immediately speakable. Keep each item under 8 words.${guidance}

Return ONLY a valid JSON array of 6 strings. No explanation, no markdown, no extra text.`
    : `Suggest 6 concise starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
Make them practical, specific, and immediately speakable. Keep each item under 8 words.${guidance}

Return ONLY a valid JSON array of 6 strings. No explanation, no markdown, no extra text.`;
}

export async function GET(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pillar = req.nextUrl.searchParams.get("pillar") ?? "";
  const allowed = new Set(["memory", "menus", "mindset", "mode", "movement", "journal", "epiphany", "explain", "booksummary", "bridge", "invite"]);
  if (!allowed.has(pillar)) {
    return NextResponse.json({ error: "Invalid pillar" }, { status: 400 });
  }

  const past = await getPastTitles(uid, pillar);
  const curated = sampleStarters(pillar, past);
  if (curated) {
    return NextResponse.json({ suggestions: curated }, { headers: { "Cache-Control": "no-store" } });
  }

  const prompt = buildPrompt(pillar, past);

  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text")?.text ?? "[]";

  let suggestions: string[] = [];
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) {
      suggestions = JSON.parse(text.slice(start, end + 1));
    }
  } catch {
    suggestions = [];
  }

  // Fallback: never return empty
  if (!suggestions.length) {
    const fallback: Record<string, string[]> = {
      booksummary: ["Atomic Habits", "Thinking, Fast and Slow", "Sapiens", "Deep Work", "Antifragile", "Range"],
      explain: ["Compound interest", "Cognitive dissonance", "First principles thinking", "The Pareto principle", "Neuroplasticity", "Occam's razor"],
      mindset: CHALLENGE_STARTERS.mindset.slice(0, 6),
      menus: ["Morning menu", "Airport packing menu", "End of workday", "Before bed", "Leaving the house", "Room reset"],
      memory: CHALLENGE_STARTERS.memory.slice(0, 6),
      mode: CHALLENGE_STARTERS.mode.slice(0, 6),
      movement: CHALLENGE_STARTERS.movement.slice(0, 6),
      journal: ["Today in one scene", "A strange good moment", "What I learned today", "A thing worth keeping", "A hard day ending", "Small wins"],
      epiphany: ["The new idea", "What finally clicked", "A better frame", "Something I realised", "The missing link", "A useful metaphor"],
      bridge: ["Encourage a friend", "Thank a collaborator", "Repair a moment", "Celebrate someone", "Explain how you feel", "Send reassurance"],
      invite: ["Invite a founder", "Invite a coach", "Invite a musician", "Invite a teacher", "Invite a friend", "Invite an early tester"],
    };
    suggestions = fallback[pillar] ?? ["Clear the surface", "Start the next thing", "Find the simple path", "Reset the room", "Make it concrete", "Move one step"];
  }

  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
