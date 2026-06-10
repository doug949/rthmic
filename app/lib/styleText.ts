const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "per", "the", "to", "vs", "via", "with"]);

function titleCaseWord(word: string, index: number, words: string[]): string {
  if (!word) return word;
  if (word.includes("|")) return word.split("|").map((part, partIndex) => titleCaseWord(part, partIndex, words)).join("|");
  if (word.includes("-")) return word.split("-").map((part, partIndex) => titleCaseWord(part, partIndex, words)).join("-");
  if (word.toUpperCase() === word && word.length <= 5) return word;

  const lower = word.toLowerCase();
  const isSmall = SMALL_WORDS.has(lower);
  const isEdge = index === 0 || index === words.length - 1;
  if (isSmall && !isEdge) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index, words) => titleCaseWord(word, index, words))
    .join(" ");
}

export function titleCaseStyle(value: string) {
  const idx = value.indexOf("|");
  if (idx > 0) {
    const name = toTitleCase(value.slice(0, idx));
    const prompt = value.slice(idx + 1).trim();
    return `${name}|${prompt}`;
  }

  const comma = value.indexOf(",");
  if (comma > 0) {
    const name = toTitleCase(value.slice(0, comma));
    const prompt = value.slice(comma + 1).trim();
    return `${name}, ${prompt}`;
  }

  return toTitleCase(value);
}
