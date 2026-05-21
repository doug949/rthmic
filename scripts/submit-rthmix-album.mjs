import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [, , albumPath, cookiePath = "/tmp/rthmic-rthmix-cookies.txt", trackList = ""] = process.argv;

if (!albumPath) {
  console.error("Usage: node scripts/submit-rthmix-album.mjs <album-json> [cookie-file]");
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(albumPath, "utf8"));
const onlyTracks = new Set(
  (trackList || process.env.RTHMIX_ONLY_TRACKS || "")
    .split(",")
    .map((track) => track.trim())
    .filter(Boolean)
);

for (const job of jobs) {
  if (onlyTracks.size > 0 && !onlyTracks.has(job.track)) continue;
  const payload = JSON.stringify({
    title: job.title,
    pillar: job.pillar,
    style: job.style,
    genre: job.genre,
    lyrics: job.lyrics,
    note: job.note,
  });

  const result = spawnSync("curl", [
    "-sS",
    "-w",
    "\nHTTP_STATUS:%{http_code}",
    "-b",
    cookiePath,
    "-H",
    "Content-Type: application/json",
    "-d",
    payload,
    "https://rthmic.app/api/queue-generation",
  ], { encoding: "utf8" });

  if (result.error) {
    console.error(`${job.track} ${job.title} error:`, result.error.message);
    process.exitCode = 1;
    continue;
  }

  const output = result.stdout.trim();
  console.log(`${job.track} ${job.title}: ${output}`);
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.status !== 0 || !output.includes("jobId")) process.exitCode = 1;

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
}
