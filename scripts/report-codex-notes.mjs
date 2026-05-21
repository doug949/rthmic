import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "redis";

function readRedisUrlFromEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  const match = raw.match(/^\s*REDIS_URL\s*=\s*(.+?)\s*$/m);
  if (!match) throw new Error("REDIS_URL not found in .env.local");
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function scanKeys(chunk) {
  if (typeof chunk === "string") return [chunk];
  if (Array.isArray(chunk)) return chunk.filter((key) => typeof key === "string");
  if (chunk && Array.isArray(chunk.keys)) return chunk.keys.filter((key) => typeof key === "string");
  return [];
}

const client = createClient({
  url: readRedisUrlFromEnvLocal(),
  socket: { reconnectStrategy: () => new Error("no-retry") },
});

client.on("error", (err) => {
  console.error("[report-codex-notes] Redis error:", err.message);
});

try {
  await client.connect();
  const results = [];

  for await (const chunk of client.scanIterator({ MATCH: "codex-notes:*", COUNT: 100 })) {
    for (const key of scanKeys(chunk)) {
      const raw = await client.get(key);
      if (!raw) continue;
      let notes;
      try { notes = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(notes)) continue;
      const open = notes.filter((note) => !note.done);
      const addressed = notes.filter((note) => note.done);
      results.push({
        key,
        total: notes.length,
        open: open.length,
        addressed: addressed.length,
        openNotes: open.map((note) => ({
          id: note.id,
          createdAt: note.createdAt,
          feedbackId: note.feedbackId,
          text: String(note.text ?? "").slice(0, 500),
        })),
      });
    }
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
} finally {
  await client.quit().catch(() => {});
}
