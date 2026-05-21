import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const [, , albumPath, cookiePath = "/tmp/rthmic-rthmix-cookies.txt", trackList = ""] = process.argv;

if (!albumPath) {
  console.error("Usage: node scripts/generate-rthmix-tracks.mjs <album-json> [cookie-file] [comma-track-list]");
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(albumPath, "utf8"));
const onlyTracks = new Set(trackList.split(",").map((track) => track.trim()).filter(Boolean));
const cookie = readFileSync(cookiePath, "utf8")
  .split(/\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const parts = line.split(/\t/);
    return `${parts[5]}=${parts[6]}`;
  })
  .join("; ");

async function postJson(url, body) {
  const result = spawnSync("curl", [
    "-sS",
    "-b",
    cookiePath,
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(body),
    "-w",
    "\nHTTP_STATUS:%{http_code}",
    url,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  const [text, statusRaw = ""] = result.stdout.split(/\nHTTP_STATUS:/);
  const status = Number(statusRaw.trim());
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
  if (result.status !== 0 || status < 200 || status >= 300) {
    throw new Error(`${url} ${status || result.status}: ${(text || result.stderr).slice(0, 500)}`);
  }
  return json;
}

async function getJson(url) {
  const result = spawnSync("curl", [
    "-sS",
    "-b",
    cookiePath,
    "-w",
    "\nHTTP_STATUS:%{http_code}",
    url,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  const [text, statusRaw = ""] = result.stdout.split(/\nHTTP_STATUS:/);
  const status = Number(statusRaw.trim());
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`${url} returned non-JSON: ${text.slice(0, 120)}`);
  }
  if (result.status !== 0 || status < 200 || status >= 300) throw new Error(`${url} ${status || result.status}: ${text.slice(0, 500)}`);
  return json;
}

async function generateTrack(job) {
  console.log(`\n${job.track} ${job.title}: starting`);
  const { taskId } = await postJson("https://rthmic.app/api/start-generation", {
    title: job.title,
    style: job.style,
    genre: job.genre,
    lyrics: job.lyrics,
  });
  if (!taskId) throw new Error("No taskId returned");
  console.log(`${job.track} ${job.title}: task ${taskId}`);

  let songs = null;
  for (let i = 0; i < 90; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const poll = await getJson(`https://rthmic.app/api/poll-generation?taskId=${encodeURIComponent(taskId)}&t=${Date.now()}`);
    console.log(`${job.track} ${job.title}: poll ${i + 1} ${poll.status}`);
    if (poll.status === "ready" && poll.songs?.length) {
      songs = poll.songs;
      break;
    }
    if (poll.status === "failed") throw new Error(poll.error || "Suno generation failed");
  }

  if (!songs) throw new Error(`${job.track} ${job.title}: timed out`);

  const pairId = songs.length > 1 ? crypto.randomUUID() : undefined;
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    await postJson("https://rthmic.app/api/library", {
      action: "save",
      rhythm: {
        id: song.id,
        title: song.title || (i === 0 ? job.title : `${job.title} (Variation)`),
        pillar: job.pillar,
        audioUrl: song.audioUrl,
        lyrics: job.lyrics,
        sunoClipId: song.sunoClipId,
        sunoTaskId: song.sunoTaskId,
        ...(pairId ? {
          pairId,
          side: i === 0 ? "A" : "B",
          alternateId: songs[i === 0 ? 1 : 0]?.id,
        } : {}),
        ...(job.note ? { note: job.note } : {}),
      },
    });
    console.log(`${job.track} ${job.title}: saved ${song.title || song.id}`);
  }
}

for (const job of jobs) {
  if (onlyTracks.size > 0 && !onlyTracks.has(job.track)) continue;
  try {
    await generateTrack(job);
  } catch (err) {
    console.error(`${job.track} ${job.title}: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    break;
  }
}
