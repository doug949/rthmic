import type { SavedRhythm } from "@/app/types/library";

export const BUILD_UPON_GENRE =
  "Scandinavian minimal microhouse in the zone of Trentemoller and Royksopp. Warm male voice, slightly vocoded, intimate and understated. Hypnotic and repetitive like a focus mantra. Clean electronic groove, soft synth pads, gentle pulsing bass, minimal percussion. 90 BPM. Emotionally grounded, intelligent, premium. No sharp edges, no drops, no build-ups. Calm forward motion.";

export function buildUponLyrics(rhythm: SavedRhythm): string {
  const sourceLyrics = rhythm.lyrics?.trim() || "No source lyrics were available.";
  const sourceNote = rhythm.note?.trim();

  return `Build upon this existing Rthm conceptually.

Source Rthm title: ${rhythm.title}
Source Rthm category: ${rhythm.pillar}
${sourceNote ? `Source note: ${sourceNote}\n` : ""}
Source lyrics:
${sourceLyrics}

Create a new Rthm that extends the idea rather than repeating it.
Keep the same core emotional and practical purpose, but move it one meaningful step forward.
Briefly acknowledge the original unlock, then add the next unlock.
The listener should feel: this is the next track after the one I already know.`;
}

export function buildUponTitle(title: string): string {
  return `${title.replace(/\s+\(Build Upon\)$/i, "")} (Build Upon)`;
}
