// /api/recommend-genre — picks the best-fit genre from the full genre list.
// Fast, cheap: uses claude-haiku-4-5 with a tight prompt.
// Accepts any number of genres (built-ins + user styles combined).
// Genre strings may be "Display Name|Suno prompt" — uses display name for matching.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { StateSummary } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

export const maxDuration = 15;

// Extract display name from "Name|Prompt" or fall back to truncating at comma/42 chars
function displayName(genre: string): string {
  const pipe = genre.indexOf("|");
  if (pipe > 0) return genre.slice(0, pipe);
  const comma = genre.indexOf(",");
  return comma > 0 ? genre.slice(0, comma) : genre.slice(0, 42);
}

export async function POST(req: NextRequest) {
  const { stateSummary, style, genres } = (await req.json()) as {
    stateSummary: StateSummary;
    style: StyleChoice;
    genres: string[];
  };

  if (!Array.isArray(genres) || genres.length < 1) {
    return NextResponse.json({ recommendedIndex: 0 });
  }

  try {
    const client = new Anthropic();
    const energyLabel = style === "A"
      ? "high energy, activation, breaking inertia, forward momentum"
      : "calm focus, settling, deep work, grounded momentum";

    const genreList = genres
      .map((g, i) => `${i}: ${displayName(g)}`)
      .join("\n");

    const maxIdx = genres.length - 1;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: `You are matching a music style to someone's emotional state.

Their state: ${stateSummary.state}
Their goal: ${stateSummary.intent}
What's blocking them: ${stateSummary.friction}
Energy needed: ${energyLabel}

Available styles:
${genreList}

Which single style (0–${maxIdx}) would work best for this person right now? Reply with only the number.`,
        },
      ],
    });

    const text = message.content.find((b) => b.type === "text")?.text?.trim() ?? "0";
    const index = parseInt(text);
    const safeIndex = isNaN(index) || index < 0 || index > maxIdx ? 0 : index;

    return NextResponse.json({ recommendedIndex: safeIndex });
  } catch (err) {
    console.error("Recommend-genre error:", err);
    return NextResponse.json({ recommendedIndex: 0 }); // fail gracefully
  }
}
