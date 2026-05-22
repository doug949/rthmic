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
    memory: "things to remember, practise, or recall under pressure",
    menus: "daily menus that are options to consider, not to-do lists",
    mindset: "situations where a mindset shift would help, including prioritisation and triage",
    mode: "states someone may want to enter on purpose, like focus, recovery, confidence, or play",
    movement: "moments where the body or energy feels stuck and needs motion",
    journal: "moments from the day worth capturing as a personal song",
    epiphany: "fresh realisations, ideas, or insights worth preserving",
    bridge: "personal messages made for someone else",
    invite: "specific people to invite into RTHMIC through a song",
  };
  const brief = pillarBriefs[pillar] ?? "useful personalised Rthm starting points";

  return hasPast
    ? `You are suggesting starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
The user has already made these Rthms:
${pastList}

Suggest 6 concise starting points they might want to make next. Avoid repeats. Make them practical, specific, and immediately speakable. Keep each item under 7 words.

Return ONLY a valid JSON array of 6 strings. No explanation, no markdown, no extra text.`
    : `Suggest 6 concise starting points for the ${pillar} pillar in RTHMIC.
This pillar is about ${brief}.
Make them practical, specific, and immediately speakable. Include at least one prioritisation or triage option when the pillar is mindset. Keep each item under 7 words.

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
      mindset: ["Too much to do", "Before a hard meeting", "Prioritise the next hour", "Stop spiralling", "Start before ready", "Recover after a knock"],
      menus: ["Morning menu", "Airport packing menu", "End of workday", "Before bed", "Leaving the house", "Room reset"],
      memory: ["Six Croatian words", "A short speech", "Client names", "Exam definitions", "A process sequence", "Key talking points"],
      mode: ["Deep focus", "Calm confidence", "Creative play", "Steady admin", "Recovery mode", "Bold outreach"],
      movement: ["Get unstuck", "Start walking", "Clean the kitchen", "Stretch and reset", "Begin the workout", "Move through resistance"],
      journal: ["Today in one scene", "A strange good moment", "What I learned today", "A thing worth keeping", "A hard day ending", "Small wins"],
      epiphany: ["The new idea", "What finally clicked", "A better frame", "Something I realised", "The missing link", "A useful metaphor"],
      bridge: ["Encourage a friend", "Thank a collaborator", "Repair a moment", "Celebrate someone", "Explain how you feel", "Send reassurance"],
      invite: ["Invite a founder", "Invite a coach", "Invite a musician", "Invite a teacher", "Invite a friend", "Invite an early tester"],
    };
    suggestions = fallback[pillar] ?? ["Clear the surface", "Start the next thing", "Find the simple path", "Reset the room", "Make it concrete", "Move one step"];
  }

  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
