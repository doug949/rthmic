// /api/interpret-genre
// Takes a user's spoken style description + optional selected artists and produces:
//   - a rich Suno-compatible style descriptor (8–18 words)
//   - 5 dynamically suggested artists derived from the description
// Returns: { style, artists, genre } — genre kept for backward compat.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const { question, selectedArtists, description } = await req.json() as {
    question: string;
    selectedArtists?: string[];
    description?: string;
  };

  const hasArtists = selectedArtists && selectedArtists.length > 0;
  const hasDescription = description && description.trim().length > 0;

  if (!hasArtists && !hasDescription) {
    return NextResponse.json({ error: "artists or description required" }, { status: 400 });
  }

  const artistsLine = hasArtists
    ? `Artists the user mentioned or selected: ${selectedArtists!.join(", ")}.`
    : "";
  const descLine = hasDescription
    ? `How they describe it: "${description!.trim()}"`
    : "";

  const context = [artistsLine, descLine].filter(Boolean).join("\n");

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 250,
      messages: [
        {
          role: "user",
          content: `Music context: "${question}"

${context}

Return ONLY a JSON object (no markdown, no extra text) with exactly these two keys:
1. "style": a Suno music style descriptor of 8–18 words capturing sonic character — feel, energy, texture, instrumentation. Do NOT mention artist names. Make it evocative and production-specific. All lowercase, no trailing punctuation.
2. "artists": an array of exactly 5 real artists/composers whose work closely matches this style. These should feel derived from the description, not generic suggestions.

Examples of good style descriptors:
- "atmospheric ambient electronic with sparse piano, deep pads, and meditative stillness"
- "high-energy arena rock with driving guitars, punchy drums, and raw urgency"
- "theatrical hip-hop with rapid-fire delivery, syncopated brass, and percussive ensemble energy"
- "euphoric nu-disco with warm bass lines, sparkling synths, and joyful momentum"

Return ONLY the JSON object, nothing else.`,
        },
      ],
    });

    const raw = message.content.find((b) => b.type === "text")?.text?.trim() ?? "";

    let style = raw;
    let artists: string[] = [];

    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim().replace(/^[^{]*(\{[\s\S]*\})[^}]*$/, "$1");
      const parsed = JSON.parse(cleaned);
      style = (parsed.style ?? "").trim();
      artists = Array.isArray(parsed.artists) ? parsed.artists.slice(0, 5) : [];
    } catch {
      // Fallback: use raw text as style, no artists
      style = raw.replace(/\{[^}]*\}/g, "").trim() || raw;
    }

    return NextResponse.json({ style, artists, genre: style });
  } catch (err) {
    console.error("interpret-genre error:", err);
    return NextResponse.json({ error: "Interpretation failed" }, { status: 500 });
  }
}
