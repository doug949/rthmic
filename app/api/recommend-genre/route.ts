// /api/recommend-genre — picks the best-fit genre from the user's set.
// Fast, cheap: uses claude-haiku-4-5 with a tight prompt.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { StateSummary } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const { stateSummary, style, genres } = (await req.json()) as {
    stateSummary: StateSummary;
    style: StyleChoice;
    genres: string[];
  };

  if (!Array.isArray(genres) || genres.length !== 4) {
    return NextResponse.json({ recommendedIndex: 0 });
  }

  try {
    const client = new Anthropic();
    const energyLabel = style === "A"
      ? "high energy, activation, breaking inertia, forward momentum"
      : "calm focus, settling, deep work, grounded momentum";

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: `You are matching a music genre to someone's emotional state.

Their state: ${stateSummary.state}
Their goal: ${stateSummary.intent}
What's blocking them: ${stateSummary.friction}
Energy needed: ${energyLabel}

Available genres:
0: ${genres[0]}
1: ${genres[1]}
2: ${genres[2]}
3: ${genres[3]}

Which single genre (0, 1, 2, or 3) would work best for this person right now? Reply with only the digit.`,
        },
      ],
    });

    const text = message.content.find((b) => b.type === "text")?.text?.trim() ?? "0";
    const index = parseInt(text[0]);
    const safeIndex = isNaN(index) || index < 0 || index > 3 ? 0 : index;

    return NextResponse.json({ recommendedIndex: safeIndex });
  } catch (err) {
    console.error("Recommend-genre error:", err);
    return NextResponse.json({ recommendedIndex: 0 }); // fail gracefully
  }
}
