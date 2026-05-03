// /api/library — server-side personal rhythm library backed by Upstash Redis.
//
// Each device gets its own library namespace via the rthmic_uid cookie
// (set at login time). No user accounts — just a stable per-device ID.
//
// Redis schema: key `lib:{uid}` → SavedRhythm[] (JSON, max ~200 songs × ~500 bytes)
//
// If Redis env vars are not configured (e.g. local dev), GET returns [] and
// POST returns ok:true — the app works, saves just don't persist.

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { PillarType } from "@/app/types/pipeline";

export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  savedAt: number;
  status: "active" | "archived";
}

const REDIS_AVAILABLE = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Lazy singleton — only constructed when env vars are present
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

function libKey(uid: string) {
  return `lib:${uid}`;
}

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

// GET /api/library — fetch all saved rhythms, newest first
export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Upstash Redis not configured — returning empty library");
    return NextResponse.json({ rhythms: [] });
  }

  try {
    const rhythms = (await getRedis().get<SavedRhythm[]>(libKey(uid))) ?? [];
    return NextResponse.json({ rhythms });
  } catch (err) {
    console.error("Redis get error:", err);
    return NextResponse.json({ rhythms: [] });
  }
}

// POST /api/library — mutate the library
// Body shapes:
//   { action: "save",   rhythm: SavedRhythm }  — upsert (prepend, dedup by id)
//   { action: "remove", id: string }            — delete by id
//   { action: "update", id: string, status: "active"|"archived" } — update status
export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Upstash Redis not configured — save skipped");
    return NextResponse.json({ ok: true });
  }

  try {
    const body = await request.json();
    const { action } = body;
    const redis = getRedis();

    const current = (await redis.get<SavedRhythm[]>(libKey(uid))) ?? [];

    let updated: SavedRhythm[];

    if (action === "save") {
      const rhythm: SavedRhythm = {
        ...body.rhythm,
        savedAt: Date.now(),
        status: "active",
      };
      updated = [rhythm, ...current.filter((r) => r.id !== rhythm.id)];
    } else if (action === "remove") {
      updated = current.filter((r) => r.id !== body.id);
    } else if (action === "update") {
      updated = current.map((r) =>
        r.id === body.id ? { ...r, status: body.status } : r
      );
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await redis.set(libKey(uid), updated);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Redis write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
