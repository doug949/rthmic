// GET /api/suggestions?pillar=booksummary|explain
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

  return hasPast
    ? `You are suggesting concepts for someone who turns concept explanations into personalised music Rthms.
They have already made Rthms explaining these concepts:
${pastList}

Suggest 6 fascinating concepts to explain next. Be guided by their intellectual interests — adjacent ideas, related fields — but do not repeat anything they have already covered. Keep concepts crisp and nameable (2–5 words max each).

Return ONLY a valid JSON array of 6 concept names. No explanation, no markdown, no extra text.`
    : `Suggest 6 fascinating concepts that would make great personalised music Rthms. Mix mental models, science, psychology, economics, and philosophy. Keep each concept crisp and nameable (2–5 words max).

Return ONLY a valid JSON array of 6 concept names. No explanation, no markdown, no extra text.`;
}

export async function GET(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pillar = req.nextUrl.searchParams.get("pillar") ?? "";
  if (pillar !== "booksummary" && pillar !== "explain") {
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
    suggestions = pillar === "booksummary"
      ? ["Atomic Habits", "Thinking, Fast and Slow", "Sapiens", "Deep Work", "Antifragile", "Range"]
      : ["Compound interest", "Cognitive dissonance", "First principles thinking", "The Pareto principle", "Neuroplasticity", "Occam's razor"];
  }

  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
