const SUNO_STYLE_LIMIT = 200;
const FADE_SUFFIX = ", fade out ending, resolving outro";

const ARTIST_REFERENCE_PATTERNS = [
  // Suno currently appears most sensitive to explicit "make it like artist X"
  // phrasing. Keep successful hand-tested exceptions below, but strip these
  // patterns by default so user/custom styles fail less often.
  /\bin the style of\s+[^,.]+/gi,
  /\bin the zone of\s+[^,.]+/gi,
  /\binspired by\s+[^,.]+/gi,
  /\binfluenced by\s+[^,.]+/gi,
  /\bsimilar to\s+[^,.]+/gi,
  /\bsounds like\s+[^,.]+/gi,
  /\bfor fans of\s+[^,.]+/gi,
  /\bà la\s+[^,.]+/gi,
  /\ba la\s+[^,.]+/gi,
];

const KNOWN_SENSITIVE_STYLE_TERMS = [
  "Trentemoller",
  "Trentemøller",
  "Royksopp",
  "Röyksopp",
  "Tycho",
  "Caribou",
  "Lin-Manuel Miranda",
  "clipping",
  "Jon Hopkins",
  "Four Tet",
  "Sigur Ros",
  "Sigur Rós",
  "Nils Frahm",
  "Len",
  "Smash Mouth",
];

const ALLOWED_ARTIST_REFERENCE_STYLES = [
  // Hand-tested in production: this exact preset is accepted and has a strong
  // creative result, so preserve it even though the default rule strips names.
  "Hamilton-style Broadway hip-hop in the zone of Lin-Manuel Miranda and clipping",
];

function pinKnownStyleRules(style: string): string {
  const isNordicNight =
    /\bnordic night\b/i.test(style) ||
    (/very slow scandinavian ambient electronic/i.test(style) && /soft nordic/i.test(style));
  if (!isNordicNight) return style;

  const prompt = style.includes("|") ? style.split("|").slice(1).join("|") : style;
  const withoutConflictingVoice = prompt
    .replace(/\bfemale\s+(vocal|voice|vocalist|singer)\b/gi, "")
    .replace(/\bwoman\s+(vocal|voice|vocalist|singer)\b/gi, "")
    .replace(/\bwomen\s+(vocal|voice|vocalist|singer)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return `Nordic Night, male vocalist only, no female vocal, soft Nordic male vocal, ${withoutConflictingVoice}`;
}

export function sanitizeSunoStyle(style: string): string {
  const pinnedStyle = pinKnownStyleRules(style);

  if (ALLOWED_ARTIST_REFERENCE_STYLES.some((allowed) => pinnedStyle.includes(allowed))) {
    return pinnedStyle
      .replace(/\.\s*/g, ", ")
      .replace(/,\s*fade out ending,\s*resolving outro/gi, "")
      .replace(/,\s*,+/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+,/g, ",")
      .trim()
      .replace(/^[,.\s]+|[,.\s]+$/g, "");
  }

  let cleaned = pinnedStyle;

  for (const pattern of ARTIST_REFERENCE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  for (const term of KNOWN_SENSITIVE_STYLE_TERMS) {
    cleaned = cleaned.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  }

  return cleaned
    .replace(/\.\s*/g, ", ")
    .replace(/,\s*fade out ending,\s*resolving outro/gi, "")
    .replace(/\b-?inspired\b/gi, "")
    .replace(/\bstyle\b(?=\s*[,.-])/gi, "")
    .replace(/\s+\band\b\s+(?=[,.])/gi, "")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
    .replace(/^[,.\s]+|[,.\s]+$/g, "");
}

export function buildSunoStyle(style: string): string {
  const cleaned = sanitizeSunoStyle(style);
  const baseStyle = cleaned || "Indie electronic, warm vocal, steady groove";
  const withFade = `${baseStyle}${FADE_SUFFIX}`;

  if (withFade.length <= SUNO_STYLE_LIMIT) return withFade;

  const budget = SUNO_STYLE_LIMIT - FADE_SUFFIX.length;
  const truncated = baseStyle.slice(0, budget);
  const lastComma = truncated.lastIndexOf(",");
  const base = lastComma > 0 ? truncated.slice(0, lastComma) : truncated;
  return `${base.trim().replace(/[,.\s]+$/g, "")}${FADE_SUFFIX}`;
}

export function styleHasVocalistDirection(style: string): boolean {
  const text = style.toLowerCase();
  return /\b(male|female|man|woman|men|women|boy|girl|masculine|feminine)\b/.test(text) ||
    /\b(duet|both vocalists|mixed vocals|vocal harmony|ensemble|choir|group vocals)\b/.test(text) ||
    /\b(voice|vocal|vocalist|singer|sung|rap|rapped|spoken)\b/.test(text);
}

export function applyVocalistPreference(style: string, vocalist: "male" | "female" | "none"): string {
  if (vocalist === "none" || styleHasVocalistDirection(style)) return style;
  return `${style}, ${vocalist} vocalist`;
}
