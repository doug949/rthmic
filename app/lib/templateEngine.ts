import fs from "fs";
import path from "path";
import type { PillarType } from "@/app/types/pipeline";

// Module files live in app/modules/ — one per pillar + MASTER.md
const MODULE_DIR = path.join(process.cwd(), "app", "modules");

const PILLAR_FILE: Record<PillarType, string> = {
  Memory:      "memory.md",
  Menus:       "menus.md",
  Mindset:     "mindset.md",
  Mode:        "mode.md",
  Movement:    "movement.md",
  Understanding: "understanding.md",
  Bridge:      "mindset.md", // Bridge uses Mindset template — emotionally warm, relational arc
};

export function loadTemplate(pillar: PillarType): string {
  const file = PILLAR_FILE[pillar];
  const filePath = path.join(MODULE_DIR, file);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export function loadMaster(): string {
  try {
    return fs.readFileSync(path.join(MODULE_DIR, "MASTER.md"), "utf-8");
  } catch {
    return "";
  }
}

// ─── Pillar detection ─────────────────────────────────────────────────────────
//
// Keyword scoring across the 6 canonical pillars.
// Mode and Movement can overlap (both involve stuckness/difficulty) — the
// distinguishing signal is emotional crisis (Mode) vs. friction/inertia (Movement).

const PILLAR_KEYWORDS: Record<PillarType, string[]> = {
  Memory: [
    "remember", "memorise", "memorize", "recall", "study", "memorising",
    "memorizing", "names", "facts", "numbers", "dates", "learn by heart",
    "imprint", "encode", "association", "lines", "script", "speech",
    "recite", "by heart",
  ],
  Menus: [
    "to-do", "todo", "tasks", "list", "options", "choices", "picking",
    "what to do", "agenda", "schedule", "menu", "inbox", "backlog",
    "decide", "decide between", "which one", "not sure what to",
    "overwhelmed by options", "too many things", "everything I need to",
  ],
  Mindset: [
    "prepare", "preparation", "ready", "getting ready", "about to",
    "upcoming", "before my", "presentation", "meeting", "interview",
    "performance", "event", "nervous about", "pre-show", "pre-match",
    "pitch", "big day", "show up", "walk in",
  ],
  Mode: [
    "overwhelmed", "panic", "spiral", "freeze", "frozen", "anxious",
    "anxiety", "stressed", "scared", "fear", "heavy", "down", "low",
    "dread", "worried", "shame", "anger", "rage", "crying", "breakdown",
    "can't cope", "too much", "falling apart", "lost it", "desperate",
    "crisis", "not okay", "shutdown",
  ],
  Movement: [
    "stuck", "stuckness", "resistance", "momentum", "blocked", "friction",
    "procrastinat", "can't start", "can't begin", "keep going", "push through",
    "get moving", "inertia", "grinding", "grind", "rhythm", "groove",
    "flow state", "focus", "deep work", "concentrate", "get into it",
    "zone", "work mode", "locked in", "productive", "working session",
  ],
  Understanding: [
    "understand", "explain", "concept", "confused", "clarity", "learn how",
    "what is", "how does", "how do I", "grasp", "comprehend", "model",
    "framework", "make sense", "wrap my head", "get my head around",
    "don't understand", "trying to figure out", "work out how",
  ],
  Bridge: [
    "for someone", "to someone", "for my", "for her", "for him", "for them",
    "send to", "dedicate", "dedication", "thinking of", "miss you", "miss them",
    "love you", "love them", "grateful for", "thank you", "to say to",
    "bridge", "gift", "for a friend", "for my partner", "for my mum", "for my dad",
  ],
};

export function detectPillar(transcript: string): PillarType {
  const lower = transcript.toLowerCase();

  const scores: Record<PillarType, number> = {
    Memory: 0, Menus: 0, Mindset: 0, Mode: 0, Movement: 0, Understanding: 0, Bridge: 0,
  };

  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS) as [PillarType, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[pillar]++;
    }
  }

  const sorted = (Object.entries(scores) as [PillarType, number][]).sort((a, b) => b[1] - a[1]);

  // Default to Mindset if no signal — most common entry state
  return sorted[0][1] > 0 ? sorted[0][0] : "Mindset";
}
