import type { SavedRhythm } from "@/app/types/library";

export interface RhythmPairCard {
  key: string;
  rhythm: SavedRhythm;
  alternate?: SavedRhythm;
  preferredSideId?: string;
}

function legacyBaseKey(rhythm: SavedRhythm): string {
  const baseTitle = rhythm.title.replace(/\s+\(Variation\)$/i, "").trim();
  const lyricKey = (rhythm.lyrics ?? "").slice(0, 80);
  return `legacy:${baseTitle}:${rhythm.pillar}:${lyricKey}`;
}

function pairKey(rhythm: SavedRhythm, legacyKeys: Set<string>): string {
  if (rhythm.pairId) return rhythm.pairId;
  const key = legacyBaseKey(rhythm);
  return legacyKeys.has(key) ? key : rhythm.id;
}

function sideOrder(rhythm: SavedRhythm): number {
  if (rhythm.side === "A") return 0;
  if (rhythm.side === "B") return 1;
  return /\(Variation\)$/i.test(rhythm.title) ? 1 : 0;
}

export function groupRhythmPairs(
  rhythms: SavedRhythm[],
  selectedSideIds: Record<string, string>
): RhythmPairCard[] {
  const groups = new Map<string, SavedRhythm[]>();
  const legacyKeys = new Set(
    rhythms
      .filter((r) => /\(Variation\)$/i.test(r.title))
      .map(legacyBaseKey)
  );
  for (const rhythm of rhythms) {
    const key = pairKey(rhythm, legacyKeys);
    groups.set(key, [...(groups.get(key) ?? []), rhythm]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const sorted = [...group].sort((a, b) => sideOrder(a) - sideOrder(b) || b.savedAt - a.savedAt);
    const selectedId = selectedSideIds[key];
    const preferredSideId = sorted.find((r) =>
      r.preferredSideId && sorted.some((candidate) => candidate.id === r.preferredSideId)
    )?.preferredSideId;
    const selected =
      sorted.find((r) => r.id === selectedId) ??
      sorted.find((r) => r.id === preferredSideId) ??
      sorted[0];
    const alternate = sorted.find((r) => r.id !== selected.id);
    return { key, rhythm: selected, alternate, preferredSideId };
  });
}

export function sideLabelFor(rhythm: SavedRhythm, fallbackIndex = 0): "A" | "B" {
  if (rhythm.side === "A" || rhythm.side === "B") return rhythm.side;
  return /\(Variation\)$/i.test(rhythm.title) || fallbackIndex === 1 ? "B" : "A";
}
