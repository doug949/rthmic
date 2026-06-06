// sunoLyrics.ts
// Transforms lyrics for Suno pronunciation without affecting display text.
//
// RTHMIC's branded spellings are intentionally non-phonetic.
// Suno reads lyrics literally, so without this transformation it will
// attempt to pronounce "Rthmic" as written — which produces garbled output.
//
// This function is applied to lyrics immediately before they are sent to Suno.
// The original spellings are preserved everywhere else (display, storage, library).
//
// Order matters: longest match first (Rthmix before Rthmic before Rthm).

// Hyphenated forms give Suno explicit syllable breaks — it sings these
// far more cleanly than whole words like "Rhythmic" or "Rhythm".
const PRONUNCIATION_MAP: [RegExp, string][] = [
  // All-caps variants (LLM often writes RTHMIC in lyrics)
  [/\bRTHMIX\b/g,  "Rith-mix"],
  [/\bRTHMIC\b/g,  "Rith-mick"],
  [/\bRTHM\b/g,    "Rith-um"],
  // Title-case variants
  [/\bRthmix\b/g,  "Rith-mix"],
  [/\bRthmic\b/g,  "Rith-mick"],
  [/\bRthm\b/g,    "Rith-um"],
  // Lowercase variants
  [/\brthmix\b/g,  "rith-mix"],
  [/\brthmic\b/g,  "rith-mick"],
  [/\brthm\b/g,    "rith-um"],
];

export const SUNO_CUSTOM_MODE_CHAR_LIMIT = 5000;

export function trimToSunoLimit(text: string, limit = SUNO_CUSTOM_MODE_CHAR_LIMIT): string {
  if (text.length <= limit) return text;

  const slice = text.slice(0, limit);
  const lastSection = slice.lastIndexOf("\n[");
  const lastLine = slice.lastIndexOf("\n");
  const cutAt = lastSection > limit * 0.72 ? lastSection : lastLine;
  return (cutAt > limit * 0.6 ? slice.slice(0, cutAt) : slice).trim();
}

export function toSunoPronunciation(lyrics: string): string {
  let result = lyrics;
  for (const [pattern, replacement] of PRONUNCIATION_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function prepareSunoPrompt(lyrics: string): string {
  return trimToSunoLimit(toSunoPronunciation(trimToSunoLimit(lyrics)));
}

// Reverse: restore branded spellings in LLM output that may contain phonetic forms.
// Applied to lyrics before they are stored or displayed.
const RESTORE_MAP: [RegExp, string][] = [
  [/\bRith-mix\b/g,  "RTHMIX"],
  [/\bRith-mick\b/g, "RTHMIC"],
  [/\bRith-um\b/g,   "RTHM"],
  [/\bRTHMIQ\b/g,    "RTHMIC"],
  [/\bRthmiq\b/g,    "RTHMIC"],
  [/\bRhythmiq\b/g,  "RTHMIC"],
  [/\bRhythmic\b/g,  "RTHMIC"],
  [/\brith-mix\b/g,  "rthmix"],
  [/\brith-mick\b/g, "rthmic"],
  [/\brith-um\b/g,   "rthm"],
  [/\brthmiq\b/g,    "rthmic"],
  [/\brhythmiq\b/g,  "rthmic"],
];

export function fromSunoPronunciation(lyrics: string): string {
  let result = lyrics;
  for (const [pattern, replacement] of RESTORE_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
