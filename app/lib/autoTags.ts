const MAX_TAGS = 8;

type TaggableRhythm = {
  title?: string;
  pillar?: unknown;
  lyrics?: string;
  note?: string;
  tags?: string[];
};

const LEGACY_AUTO_TAGS = new Set([
  "memory", "menus", "mindset", "mode shift", "movement", "understanding",
  "bridge", "invite", "journal", "idea", "explain", "books", "calm",
  "confidence", "focus", "starting", "routine", "fitness", "language",
  "work", "relationships", "gratitude", "rest", "planning", "study",
  "recall", "insight", "clarity", "creative", "money", "travel",
]);

const KEYWORD_TAGS: Array<[RegExp, string]> = [
  [/\binbound marketing\b/i, "inbound marketing"],
  [/\b(content marketing|content strategy|content plan|content calendar)\b/i, "content marketing"],
  [/\b(marketing|brand|branding|campaign|advertising|audience|positioning)\b/i, "marketing"],
  [/\b(business|company|startup|founder|entrepreneur|commercial|client|customer)\b/i, "business"],
  [/\b(sales|pipeline|lead|leads|prospect|conversion|crm)\b/i, "sales"],
  [/\b(video|youtube|reel|shorts|tiktok|camera|film|editing|production)\b/i, "video"],
  [/\b(social media|linkedin|instagram|facebook|x.com|twitter|post|posting)\b/i, "social media"],
  [/\b(seo|search engine|keyword|keywords|google ranking|rankings)\b/i, "seo"],
  [/\b(email|newsletter|mailing list|subscriber|subscribers)\b/i, "email marketing"],
  [/\b(website|landing page|homepage|web page|webpage|site)\b/i, "website"],
  [/\b(strategy|strategic|roadmap|plan|planning|priorit|goal|goals)\b/i, "strategy"],
  [/\b(product|saas|app|platform|feature|features|launch)\b/i, "product"],
  [/\b(ai|artificial intelligence|chatgpt|automation|automate|prompt|prompts)\b/i, "ai"],
  [/\b(finance|financial|money|budget|invoice|tax|pricing|revenue|profit)\b/i, "finance"],
  [/\b(legal|contract|compliance|gdpr|policy|terms)\b/i, "legal"],
  [/\b(health|fitness|workout|exercise|push[ -]?ups?|gym|running|nutrition)\b/i, "health"],
  [/\b(language|phrase|phrases|croatian|spanish|french|irish|italian|german)\b/i, "language"],
  [/\b(book|summary|author|chapter|atomic habits|sapiens|deep work)\b/i, "books"],
  [/\b(study|exam|lesson|course|learn|learning|revision|memorise|memorize)\b/i, "education"],
  [/\b(meeting|workshop|presentation|pitch|interview|call)\b/i, "communication"],
  [/\b(relationship|family|friend|partner|apology|repair)\b/i, "relationships"],
  [/\b(travel|trip|flight|airport|hotel|city|country)\b/i, "travel"],
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
  const text = [rhythm.title, rhythm.note, rhythm.lyrics].filter(Boolean).join("\n");
  for (const [pattern, tag] of KEYWORD_TAGS) {
    if (pattern.test(text)) tags.push(tag);
    if (tags.length >= max) break;
  }

  return normalizeTags(tags, max);
}

export function tagsForSavedRhythm(rhythm: TaggableRhythm, max = MAX_TAGS): string[] {
  const existing = normalizeTags(rhythm.tags, max);
  const generated = autoTagsForRhythm(rhythm, max);
  const onlyLegacyAutoTags = existing.length > 0 && existing.every((tag) => LEGACY_AUTO_TAGS.has(tag));
  if (onlyLegacyAutoTags && generated.length > 0) return generated;
  if (existing.length >= max) return existing;
  return normalizeTags([...existing, ...generated], max);
}
