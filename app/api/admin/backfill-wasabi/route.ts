// GET /api/admin/backfill-wasabi
// One-shot: walks every lib:* key in Redis, finds rhythms with audioUrl but no
// audioKey, downloads each from Suno CDN and uploads to Wasabi, then patches
// audioKey back into Redis.
//
// Safe to run multiple times — skips any rhythm that already has audioKey.
// Run it once after deploying Wasabi storage support.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";

export const maxDuration = 60;

function requireAuth(req: NextRequest): boolean {
  const session = req.cookies.get("rthmic_session");
  return session?.value === process.env.RTHMIC_SESSION_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.REDIS_URL || !process.env.WASABI_ACCESS_KEY_ID) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const results: { id: string; title: string; status: "uploaded" | "skipped" | "failed"; reason?: string }[] = [];

  try {
    // Scan all lib:* keys
    const libKeys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "lib:*", COUNT: 100 })) {
      if (typeof key === "string") libKeys.push(key);
      else libKeys.push(...(key as string[]));
    }

    console.log(`[backfill] found ${libKeys.length} library key(s)`);

    for (const libKey of libKeys) {
      const userId = libKey.slice(4); // strip "lib:"
      const raw = await client.get(libKey);
      if (!raw) continue;

      const all: SavedRhythm[] = JSON.parse(raw);
      let dirty = false;

      for (const rhythm of all) {
        // Skip deleted, skip already backed up, skip if no source URL
        if (rhythm.status === "deleted") continue;
        if (rhythm.audioKey) {
          results.push({ id: rhythm.id, title: rhythm.title, status: "skipped", reason: "already has audioKey" });
          continue;
        }
        if (!rhythm.audioUrl) {
          results.push({ id: rhythm.id, title: rhythm.title, status: "skipped", reason: "no audioUrl" });
          continue;
        }

        const wasabiKey = `rhythms/${userId}/${rhythm.id}.mp3`;
        try {
          await uploadAudioToWasabi(rhythm.audioUrl, wasabiKey);
          rhythm.audioKey = wasabiKey;
          dirty = true;
          results.push({ id: rhythm.id, title: rhythm.title, status: "uploaded" });
          console.log(`[backfill] uploaded ${wasabiKey}`);
        } catch (e) {
          results.push({ id: rhythm.id, title: rhythm.title, status: "failed", reason: String(e) });
          console.warn(`[backfill] failed ${rhythm.id}:`, e);
        }
      }

      if (dirty) {
        await client.set(libKey, JSON.stringify(all));
      }
    }
  } finally {
    await client.disconnect();
  }

  const uploaded = results.filter((r) => r.status === "uploaded").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return NextResponse.json({ uploaded, failed, skipped, results });
}
