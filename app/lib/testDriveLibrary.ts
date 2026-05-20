import type { SavedRhythm } from "@/app/api/library/route";

export const TEST_DRIVE_CODE = "testdrive";

const now = Date.UTC(2026, 0, 1, 12, 0, 0);

const inviteLyrics = (category: string) => `[${category.toUpperCase()}]
This is a sample Rthm in the ${category} category.
Listen for the shape of it.
Then make one from your own words.

[MAKE YOUR OWN]
RTHMIC works best when it starts with your real state.
Tap Create a Rthm.
Say what is happening.
Let the next track be yours.`;

export function testDriveLibrary(): SavedRhythm[] {
  return [
    sample("sample-memory", "Sample: Remember Something", "Memory", "your-already-held.mp3", 12),
    sample("sample-menus", "Sample: Build a Menu", "Menus", "Morning Menus • 260404A.mp3", 11),
    sample("sample-mindset", "Sample: Shift State", "Mindset", "therapy.mp3", 10),
    sample("sample-mode", "Sample: Change Mode", "Mode", "Hold the Night (Edit).mp3", 9),
    sample("sample-movement", "Sample: Get Moving", "Movement", "Early Motion 2.mp3", 8),
    sample("sample-understanding", "Sample: Understand It", "Understanding", "I Understand 1.mp3", 7),
    sample("sample-bridge", "Sample: Send a Bridge", "Bridge", "I ALREADY KNEW YOUR NAME 2.mp3", 6),
    sample("sample-invite", "Sample: Invite Someone In", "Invite", "Introducing RTHMIC (Edit) (Edit).mp3", 5),
    sample("sample-journal", "Sample: Journal the Moment", "Journal", "Outcome Candidates.mp3", 4),
    sample("sample-epiphany", "Sample: Catch the Realisation", "Epiphany", "The Vacuum of The Inbetween Moment 1.mp3", 3),
    sample("sample-explain", "Sample: Explain a Thing", "Explain", "You already know the seven. - 1.mp3", 2),
    sample("sample-booksummary", "Sample: Book Summary", "BookSummary", "Cage Drop.mp3", 1),
  ];
}

function sample(
  id: string,
  title: string,
  pillar: SavedRhythm["pillar"],
  audioKey: string,
  offset: number
): SavedRhythm {
  return {
    id,
    title,
    pillar,
    audioKey,
    lyrics: inviteLyrics(pillar),
    note: `Test drive sample for ${pillar}. Play it, then create your own Rthm from your real situation.`,
    savedAt: now - offset * 60_000,
    status: "active",
    tags: ["test drive"],
    playCount: 0,
  };
}
