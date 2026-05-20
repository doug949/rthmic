import type { PillarType } from "@/app/types/pipeline";

const MAX_TAGS = 8;

type TaggableRhythm = {
  title?: string;
  pillar?: PillarType;
  lyrics?: string;
  note?: string;
  tags?: string[];
};

const PILLAR_TAGS: Partial<Record<PillarType, string>> = {
  Memory: "memory",
  Menus: "menus",
  Mindset: "mindset",
  Mode: "mode shift",
  Movement: "movement",
  Understanding: "understanding",
  Bridge: "bridge",
  Invite: "invite",
  Journal: "journal",
  Epiphany: "idea",
  Explain: "explain",
  BookSummary: "books",
};

const KEYWORD_TAGS: Array<[RegExp, string]> = [
  [/\b(anxious|anxiety|panic|overwhelm|overwhelmed|spiral|stress|stressed)\b/i, "calm"],
  [/\b(confident|confidence|ready|presentation|pitch|interview|stage)\b/i, "confidence"],
  [/\b(focus|deep work|concentrate|attention|distracted|distraction)\b/i, "focus"],
  [/\b(start|starting|begin|procrastinat|stuck|resistance|friction)\b/i, "starting"],
  [/\b(habit|routine|ritual|daily|morning|evening)\b/i, "routine"],
  [/\b(workout|exercise|push[ -]?ups?|gym|run|running|walk|walking|fitness)\b/i, "fitness"],
  [/\b(language|phrase|phrases|croatian|spanish|french|irish|italian|german)\b/i, "language"],
  [/\b(book|summary|author|chapter|atomic habits|sapiens|deep work)\b/i, "books"],
  [/\b(meeting|client|sales|workshop|call|conversation)\b/i, "work"],
  [/\b(apology|relationship|family|friend|partner|bridge|repair)\b/i, "relationships"],
  [/\b(grateful|gratitude|thankful|appreciat)\b/i, "gratitude"],
  [/\b(sleep|rest|tired|bed|wind down|winding down)\b/i, "rest"],
  [/\b(plan|planning|priorit|schedule|deadline|time)\b/i, "planning"],
  [/\b(study|exam|learn|revision|remember|memorise|memorize|recall)\b/i, "study"],
  [/\b(speech|script|lines|names|sequence|list)\b/i, "recall"],
  [/\b(idea|insight|realisation|realization|epiphany|breakthrough)\b/i, "insight"],
  [/\b(decide|decision|choice|choose|clarity)\b/i, "clarity"],
  [/\b(write|writing|draft|creative|create|maker)\b/i, "creative"],
  [/\b(money|finance|budget|price|invoice|tax)\b/i, "money"],
  [/\b(travel|trip|flight|airport|hotel)\b/i, "travel"],
];

function cleanTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 +#-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 32)
    .trim();
}

export function normalizeTags(tags: string[] | undefined, max = MAX_TAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = cleanTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export function autoTagsForRhythm(rhythm: TaggableRhythm, max = MAX_TAGS): string[] {
  const tags: string[] = [];
  if (rhythm.pillar && PILLAR_TAGS[rhythm.pillar]) tags.push(PILLAR_TAGS[rhythm.pillar]!);

  const text = [rhythm.title, rhythm.note, rhythm.lyrics].filter(Boolean).join("\n");
  for (const [pattern, tag] of KEYWORD_TAGS) {
    if (pattern.test(text)) tags.push(tag);
    if (tags.length >= max) break;
  }

  return normalizeTags(tags, max);
}

export function tagsForSavedRhythm(rhythm: TaggableRhythm, max = MAX_TAGS): string[] {
  const existing = normalizeTags(rhythm.tags, max);
  if (existing.length >= max) return existing;
  const generated = autoTagsForRhythm(rhythm, max);
  return normalizeTags([...existing, ...generated], max);
}
