import fs from "fs";
import path from "path";
import type { PillarType } from "@/app/types/pipeline";

const TEMPLATE_DIR = path.join(process.cwd(), "templates");

const PILLAR_FILE: Record<PillarType, string> = {
  Mode: "mode.md",
  Algorithm: "algorithm.md",
  Menu: "menu.md",
  Memorisation: "memorisation.md",
  Mindset: "mindset.md",
};

export function loadTemplate(pillar: PillarType): string {
  const file = PILLAR_FILE[pillar];
  const filePath = path.join(TEMPLATE_DIR, file);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// Keyword-based pillar detection used by mock LLM
const PILLAR_KEYWORDS: Record<PillarType, string[]> = {
  Mode: ["focus", "flow", "deep work", "concentrate", "get into", "zone", "work mode", "locked in", "productive", "working"],
  Algorithm: ["steps", "process", "routine", "sequence", "workflow", "inbox", "tasks", "checklist", "procedure", "how to"],
  Menu: ["decide", "choice", "options", "picking", "choosing", "stuck between", "which one", "not sure", "overwhelmed by options"],
  Memorisation: ["remember", "memorise", "memorize", "learn", "recall", "study", "names", "facts", "numbers", "dates"],
  Mindset: ["anxious", "anxiety", "stressed", "overwhelmed", "scared", "fear", "heavy", "down", "low", "stuck", "frozen", "dread", "worried", "procrastinat"],
};

export function detectPillar(transcript: string): PillarType {
  const lower = transcript.toLowerCase();
  const scores: Record<PillarType, number> = {
    Mode: 0, Algorithm: 0, Menu: 0, Memorisation: 0, Mindset: 0,
  };

  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS) as [PillarType, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[pillar]++;
    }
  }

  const sorted = (Object.entries(scores) as [PillarType, number][]).sort((a, b) => b[1] - a[1]);
  // Default to Mindset if no strong signal — most common entry state
  return sorted[0][1] > 0 ? sorted[0][0] : "Mindset";
}
