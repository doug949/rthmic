const SUNO_STYLE_LIMIT = 200;
const FADE_SUFFIX = ", fade out ending, resolving outro";

const ARTIST_REFERENCE_PATTERNS = [
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

export function sanitizeSunoStyle(style: string): string {
  let cleaned = style;

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
