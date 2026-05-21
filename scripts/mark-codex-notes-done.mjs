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
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function normalizeId(id) {
  return id.startsWith("feedback-") || id.startsWith("note-") ? id : `feedback-${id}`;
}

const ids = process.argv.slice(2).filter(Boolean).map(normalizeId);

if (ids.length === 0) {
  console.error("Usage: node scripts/mark-codex-notes-done.mjs <feedback-id|note-id> [...]");
  process.exit(1);
}

const wanted = new Set(ids);
const client = createClient({
  url: readRedisUrlFromEnvLocal(),
  socket: {
    reconnectStrategy: () => new Error("no-retry"),
  },
});

client.on("error", (err) => {
  console.error("[mark-codex-notes-done] Redis error:", err.message);
});

let touched = 0;
let matched = 0;

try {
  await client.connect();

  for await (const key of client.scanIterator({ MATCH: "codex-notes:*", COUNT: 100 })) {
    const raw = await client.get(key);
    if (!raw) continue;

    let notes;
    try {
      notes = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(notes)) continue;

    let changed = false;
    const updated = notes.map((note) => {
      if (!note?.id || !wanted.has(note.id)) return note;
      matched++;
      if (note.done) return note;
      changed = true;
      return { ...note, done: true, doneAt: Date.now() };
    });

    if (changed) {
      await client.set(key, JSON.stringify(updated));
      touched++;
    }
  }
  console.log(JSON.stringify({ ok: true, requested: ids.length, matched, updatedKeys: touched }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
} finally {
  await client.quit().catch(() => {});
}
