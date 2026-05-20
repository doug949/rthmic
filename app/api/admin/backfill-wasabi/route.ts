// GET /api/admin/backfill-wasabi?batch=5
// Paginated backfill — processes `batch` tracks per call (default 5).
// Returns `done: true` when nothing is left to upload.
// Call repeatedly until done:true.

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

  const batchSize = Math.min(
    parseInt(req.nextUrl.searchParams.get("batch") ?? "5", 10) || 5,
    20 // hard cap — more than 20 uploads will always timeout
  );

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const uploaded: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  let processed = 0;
  let remaining = 0;

  try {
    const libKeys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "lib:*", COUNT: 100 })) {
      if (typeof key === "string") libKeys.push(key);
      else libKeys.push(...(key as string[]));
    }

    for (const libKey of libKeys) {
      const userId = libKey.slice(4);
      const raw = await client.get(libKey);
      if (!raw) continue;

      const all: SavedRhythm[] = JSON.parse(raw);
      let dirty = false;

      for (const rhythm of all) {
        if (rhythm.status === "deleted" || rhythm.audioKey || !rhythm.audioUrl) continue;

        remaining++;

        if (processed >= batchSize) continue; // count but don't upload yet

        const wasabiKey = `rhythms/${userId}/${rhythm.id}.mp3`;
        try {
          await uploadAudioToWasabi(rhythm.audioUrl, wasabiKey);
          rhythm.audioKey = wasabiKey;
          dirty = true;
          uploaded.push(rhythm.title);
          processed++;
          remaining--; // this one is now done
          console.log(`[backfill] uploaded ${wasabiKey}`);
        } catch (e) {
          failed.push({ id: rhythm.id, reason: String(e) });
          processed++;
          console.warn(`[backfill] failed ${rhythm.id}:`, e);
        }
      }

      if (dirty) await client.set(libKey, JSON.stringify(all));
    }
  } finally {
    await client.disconnect();
  }

  return NextResponse.json({
    done: remaining === 0,
    uploaded: uploaded.length,
    failed: failed.length,
    remaining,
    uploadedTracks: uploaded,
    failedTracks: failed,
  });
}
