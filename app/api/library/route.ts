// /api/library — server-side personal rhythm library backed by Redis.
//
// Each device gets its own library namespace via the rthmic_uid cookie
// (set at login time). No user accounts — just a stable per-device ID.
//
// Redis schema: key `lib:{uid}` → SavedRhythm[] (JSON)
//
// Deletion is soft: status → "deleted" + deletedAt timestamp.
// Items are recoverable for 30 days, then purged lazily on next read.
//
// If REDIS_URL is not configured (e.g. local dev), GET returns [] and
// POST returns ok:true — the app works, saves just don't persist.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { PillarType, TimedWord } from "@/app/types/pipeline";
import { normalisePillar } from "@/app/types/pipeline";
import { normalizeTags, tagsForSavedRhythm } from "@/app/lib/autoTags";

export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  lyrics?: string;
  savedAt: number;
  status: "new" | "active" | "favourite" | "archived" | "deleted";
  deletedAt?: number;
  tags?: string[];
  note?: string;
  playCount?: number;
  lastPlayedAt?: number;
  pairId?: string;         // A/B-side pair generated from the same Suno task
  side?: "A" | "B";
  alternateId?: string;
  sunoClipId?: string;      // raw Suno clip ID (audioId) for timed-lyrics API
  sunoTaskId?: string;      // Suno task ID — required alongside audioId to fetch timed lyrics
  timedLyrics?: TimedWord[]; // word-level synchronized lyric data from Suno
  audioKey?: string;        // Wasabi S3 key — present once audio is permanently stored
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const REDIS_AVAILABLE = !!process.env.REDIS_URL;

function libKey(uid: string) {
  return `lib:${uid}`;
}

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

async function withRedis<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

// GET /api/library — fetch all rhythms (active, archived, recently deleted)
export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Redis not configured — returning empty library");
    return NextResponse.json({ rhythms: [] });
  }

  try {
    const rhythms = await withRedis(async (client) => {
      const data = await client.get(libKey(uid));
      const all: SavedRhythm[] = data ? JSON.parse(data) : [];

      // Lazily purge deleted items older than 30 days
      const now = Date.now();
      const kept = all.filter(
        (r) => r.status !== "deleted" || (r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS)
      );

      // Write back if anything was purged
      if (kept.length !== all.length) {
        await client.set(libKey(uid), JSON.stringify(kept));
      }

      // Normalise legacy pillar names and quietly backfill missing tags.
      const normalised = kept.map((r) => {
        const pillar = normalisePillar(r.pillar) as PillarType;
        return {
          ...r,
          pillar,
          tags: r.tags?.length ? normalizeTags(r.tags) : tagsForSavedRhythm({ ...r, pillar }),
        };
      });

      if (JSON.stringify(normalised) !== JSON.stringify(kept)) {
        await client.set(libKey(uid), JSON.stringify(normalised));
      }

      return normalised;
    });
    return NextResponse.json({ rhythms });
  } catch (err) {
    console.error("Redis get error:", err);
    return NextResponse.json({ rhythms: [] });
  }
}

// POST /api/library — mutate the library
// Body shapes:
//   { action: "save",    rhythm: SavedRhythm }                           — upsert
//   { action: "remove",  id: string }                                     — soft-delete (30-day recovery)
//   { action: "update",  id: string, status?, tags? }                     — update status and/or tags
//   { action: "incrementPlay", id: string }                               — increment all-time play count
//   { action: "retag" }                                                    — re-run auto-tagging across saved rhythms
export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Redis not configured — save skipped");
    return NextResponse.json({ ok: true });
  }

  const body = await request.json();
  const { action } = body;

  if (!["save", "remove", "batch-remove", "update", "incrementPlay", "retag"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    let retagged = 0;
    await withRedis(async (client) => {
      const data = await client.get(libKey(uid));
      const current: SavedRhythm[] = data ? JSON.parse(data) : [];

      let updated: SavedRhythm[];

      if (action === "save") {
        const rhythm: SavedRhythm = {
          ...body.rhythm,
          tags: tagsForSavedRhythm(body.rhythm),
          savedAt: Date.now(),
          status: "active",
        };
        updated = [rhythm, ...current.filter((r) => r.id !== rhythm.id)];
      } else if (action === "remove") {
        updated = current.map((r) =>
          r.id === body.id ? { ...r, status: "deleted" as const, deletedAt: Date.now() } : r
        );
      } else if (action === "batch-remove") {
        const ids = new Set<string>(body.ids ?? []);
        updated = current.map((r) =>
          ids.has(r.id) ? { ...r, status: "deleted" as const, deletedAt: Date.now() } : r
        );
      } else if (action === "incrementPlay") {
        updated = current.map((r) =>
          r.id === body.id
            ? { ...r, playCount: (r.playCount ?? 0) + 1, lastPlayedAt: Date.now() }
            : r
        );
      } else if (action === "retag") {
        updated = current.map((r) => {
          if (r.status === "deleted") return r;
          const next = { ...r, tags: tagsForSavedRhythm(r) };
          if (JSON.stringify(next.tags ?? []) !== JSON.stringify(r.tags ?? [])) retagged++;
          return next;
        });
      } else {
        // update — status and/or tags; clears deletedAt when un-deleting
        updated = current.map((r) => {
          if (r.id !== body.id) return r;
          const next: SavedRhythm = { ...r };
          if (body.status      !== undefined) next.status      = body.status as SavedRhythm["status"];
          if (body.tags        !== undefined) next.tags        = normalizeTags(body.tags as string[]);
          if (body.note        !== undefined) next.note        = body.note as string;
          if (body.timedLyrics !== undefined) next.timedLyrics = body.timedLyrics as TimedWord[];
          if (next.status !== "deleted") delete next.deletedAt;
          return next;
        });
      }

      await client.set(libKey(uid), JSON.stringify(updated));
    });

    return NextResponse.json({ ok: true, retagged });
  } catch (err) {
    console.error("Redis write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
