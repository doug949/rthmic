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

const PRONUNCIATION_MAP: [RegExp, string][] = [
  [/\bRthmix\b/g,  "Rith-mix"],   // Rthmix  → Rith-mix
  [/\bRthmic\b/g,  "Rhythmic"],   // Rthmic  → Rhythmic
  [/\bRthm\b/g,    "Rhythm"],     // Rthm    → Rhythm
  // Lowercase variants
  [/\brthmix\b/g,  "rith-mix"],
  [/\brthmic\b/g,  "rhythmic"],
  [/\brthm\b/g,    "rhythm"],
];

export function toSunoPronunciation(lyrics: string): string {
  let result = lyrics;
  for (const [pattern, replacement] of PRONUNCIATION_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
