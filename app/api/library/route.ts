// /api/library — server-side personal rhythm library backed by Redis.
//
// Each device gets its own library namespace via the rthmic_uid cookie
// (set at login time). No user accounts — just a stable per-device ID.
//
// Redis schema: key `lib:{uid}` → SavedRhythm[] (JSON)
//
// If REDIS_URL is not configured (e.g. local dev), GET returns [] and
// POST returns ok:true — the app works, saves just don't persist.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { PillarType } from "@/app/types/pipeline";

export interface SavedRhythm {
  id: string;
  title: string;
  pillar: PillarType;
  audioUrl?: string;
  savedAt: number;
  status: "active" | "archived";
}

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

// GET /api/library — fetch all saved rhythms, newest first
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
      return data ? (JSON.parse(data) as SavedRhythm[]) : [];
    });
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
    console.warn("Redis not configured — save skipped");
    return NextResponse.json({ ok: true });
  }

  const body = await request.json();
  const { action } = body;

  if (!["save", "remove", "update"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    await withRedis(async (client) => {
      const data = await client.get(libKey(uid));
      const current: SavedRhythm[] = data ? JSON.parse(data) : [];

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
      } else {
        updated = current.map((r) =>
          r.id === body.id ? { ...r, status: body.status } : r
        );
      }

      await client.set(libKey(uid), JSON.stringify(updated));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Redis write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
