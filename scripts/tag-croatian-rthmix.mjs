import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [, , cookiePath = "/tmp/rthmic-rthmix-cookies.txt"] = process.argv;

const RTHMIX_ID = "croatian-starter-memory";
const RTHMIX_TITLE = "Croatian Starter";
const ALBUM_ART_PROMPT = "Square album cover for Croatian Starter, a premium Rthmix memory album: Adriatic coastline at dusk, purple-gold moonlit water, six small glowing language tokens, subtle tamburica strings, modern minimal typography, cinematic but clean.";

const tracks = [
  { number: "00", title: "Ground Zero: Six Words, Six Hooks", role: "ground-zero", unlock: "How to use this Memory Rthmix" },
  { number: "01", title: "Hvala: The First Door", role: "memory-hook", unlock: "hvala = thank you" },
  { number: "02", title: "Molim: The Polite Ask", role: "memory-hook", unlock: "molim = please / you're welcome" },
  { number: "03", title: "Da: The Door Opens", role: "memory-hook", unlock: "da = yes" },
  { number: "04", title: "Ne: The Clean Boundary", role: "memory-hook", unlock: "ne = no" },
  { number: "05", title: "Voda: The River Word", role: "memory-hook", unlock: "voda = water" },
  { number: "06", title: "Kruh: Bread at the Table", role: "memory-hook", unlock: "kruh = bread" },
  { number: "07", title: "Bonus: You Have Six", role: "bonus", unlock: "Reflect on the full chain" },
];

function curl(args) {
  const result = spawnSync("curl", ["-sS", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `curl exited ${result.status}`);
  return result.stdout;
}

const libraryRaw = curl(["-b", cookiePath, "https://rthmic.app/api/library"]);
const library = JSON.parse(libraryRaw);

let tagged = 0;
for (const rhythm of library.rhythms ?? []) {
  if (rhythm.status === "deleted") continue;
  const baseTitle = String(rhythm.title ?? "").replace(/\s+\(Variation\)$/i, "");
  const track = tracks.find((candidate) => candidate.title === baseTitle);
  if (!track) continue;

  const body = JSON.stringify({
    action: "update",
    id: rhythm.id,
    rthmixId: RTHMIX_ID,
    rthmixTitle: RTHMIX_TITLE,
    rthmixType: "memory",
    rthmixTrackNumber: track.number,
    rthmixTrackRole: track.role,
    rthmixUnlock: track.unlock,
    rthmixAlbumArtPrompt: ALBUM_ART_PROMPT,
  });

  const out = curl([
    "-b",
    cookiePath,
    "-H",
    "Content-Type: application/json",
    "-d",
    body,
    "https://rthmic.app/api/library",
  ]);
  if (!out.includes("\"ok\":true")) throw new Error(`Failed to tag ${rhythm.title}: ${out}`);
  tagged++;
  console.log(`tagged ${track.number} ${rhythm.title}`);
}

console.log(`Tagged ${tagged} Croatian Rthmix side(s).`);
