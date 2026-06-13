// /api/recommend-genre — picks the best-fit genre from the full genre list.
// Fast, cheap: uses claude-haiku-4-5 with a tight prompt.
// Accepts any number of genres (built-ins + user styles combined).
// Genre strings may be "Display Name|Suno prompt" — uses display name for matching.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { normalisePillar, type StateSummary } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";
import { emptyStylePreferences, type StyleCategoryId, type StylePreferences } from "@/app/types/stylePreferences";

export const maxDuration = 15;

function fixedPreferenceCategory(pillar?: string): StyleCategoryId | null {
  if (!pillar) return null;
  const normalised = normalisePillar(pillar);
  if (normalised === "Menus") return "focus";
  if (normalised === "Sleep") return "safety";
  return null;
}

// Extract display name from "Name|Prompt" or fall back to truncating at comma/42 chars
function displayName(genre: string): string {
  const pipe = genre.indexOf("|");
  if (pipe > 0) return genre.slice(0, pipe);
  const comma = genre.indexOf(",");
  return comma > 0 ? genre.slice(0, comma) : genre.slice(0, 42);
}

export async function POST(req: NextRequest) {
  const { stateSummary, style, genres, pillar, stylePreferences = emptyStylePreferences() } = (await req.json()) as {
    stateSummary: StateSummary;
    style: StyleChoice;
    genres: string[];
    pillar?: string;
    stylePreferences?: StylePreferences;
  };
  const forcedCategory = fixedPreferenceCategory(pillar);

  if (!Array.isArray(genres) || genres.length < 1) {
    return NextResponse.json({ recommendedIndex: 0, preferenceCategory: forcedCategory ?? "focus" });
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

    const overrideLines = Object.entries(stylePreferences)
      .filter(([, pref]) => pref?.overrideStyle)
      .map(([category, pref]) => `${category}: ${displayName(pref.overrideStyle)}`)
      .join("\n");
    const preferenceLines = Object.entries(stylePreferences)
      .map(([category, pref]) => {
        const details = [...(pref?.selections ?? []), pref?.customDescription ?? ""].filter(Boolean).join(", ");
        return details ? `${category}: ${details}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 40,
      messages: [
        {
          role: "user",
          content: `You are matching a music style to someone's emotional state.

Their state: ${stateSummary.state}
Their goal: ${stateSummary.intent}
What's blocking them: ${stateSummary.friction}
Energy needed: ${energyLabel}
${forcedCategory ? `RTHMIC has already selected the ${forcedCategory} preference category for this kind of Rthm. You must use that category.` : ""}

The user has four music preference categories. First decide which category best serves this state: power, focus, energy, or safety.
Category preferences:
${preferenceLines || "No category preferences saved"}

Category style overrides (when the matching category has one, choose that exact available style):
${overrideLines || "No overrides saved"}

Available styles:
${genreList}

${forcedCategory
  ? `Which single style (0-${maxIdx}) best matches the ${forcedCategory} category and this state? Reply only as JSON: {"category":"${forcedCategory}","index":0}`
  : `Which category and single style (0-${maxIdx}) would work best right now? Reply only as JSON: {"category":"power|focus|energy|safety","index":0}`}`,
        },
      ],
    });

    const text = message.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    let category = "focus";
    let index = 0;
    try {
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim());
      if (["power", "focus", "energy", "safety"].includes(parsed.category)) category = parsed.category;
      index = Number(parsed.index);
    } catch {
      index = parseInt(text);
    }
    if (forcedCategory) category = forcedCategory;
    const categoryPreference = stylePreferences[category as keyof StylePreferences];
    if (categoryPreference?.overrideStyle) {
      const overridePrompt = categoryPreference.overrideStyle.includes("|")
        ? categoryPreference.overrideStyle.slice(categoryPreference.overrideStyle.indexOf("|") + 1).trim().toLowerCase()
        : categoryPreference.overrideStyle.trim().toLowerCase();
      const exactOverrideIndex = genres.findIndex((genre) => {
        const prompt = genre.includes("|") ? genre.slice(genre.indexOf("|") + 1) : genre;
        return genre.toLowerCase() === categoryPreference.overrideStyle.toLowerCase()
          || prompt.trim().toLowerCase() === overridePrompt;
      });
      if (exactOverrideIndex >= 0) index = exactOverrideIndex;
    }
    const safeIndex = isNaN(index) || index < 0 || index > maxIdx ? 0 : index;

    return NextResponse.json({ recommendedIndex: safeIndex, preferenceCategory: category });
  } catch (err) {
    console.error("Recommend-genre error:", err);
    return NextResponse.json({ recommendedIndex: 0, preferenceCategory: forcedCategory ?? "focus" }); // fail gracefully
  }
}
