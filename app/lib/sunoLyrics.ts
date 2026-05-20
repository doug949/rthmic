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

export function toSunoPronunciation(lyrics: string): string {
  let result = lyrics;
  for (const [pattern, replacement] of PRONUNCIATION_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Reverse: restore branded spellings in LLM output that may contain phonetic forms.
// Applied to lyrics before they are stored or displayed.
const RESTORE_MAP: [RegExp, string][] = [
  [/\bRith-mix\b/g,  "RTHMIX"],
  [/\bRith-mick\b/g, "RTHMIC"],
  [/\bRith-um\b/g,   "RTHM"],
  [/\brith-mix\b/g,  "rthmix"],
  [/\brith-mick\b/g, "rthmic"],
  [/\brith-um\b/g,   "rthm"],
];

export function fromSunoPronunciation(lyrics: string): string {
  let result = lyrics;
  for (const [pattern, replacement] of RESTORE_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
