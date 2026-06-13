// /api/genlog — generation log, Redis-backed, per-user
// Key: genlog:{uid} → GenLogEntry[] (newest first, capped at 100)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

export interface GenLogEntry {
  id: string;           // crypto.randomUUID()
  timestamp: number;    // Date.now() when logged
  title: string;
  pillar: string;
  genre: string;
  style: string;
  menuSlug?: string;
  status: "success" | "failed" | "timeout";
  durationMs: number;
  songs?: { id: string; title: string }[];
  error?: string;
}

const REDIS_AVAILABLE = !!process.env.REDIS_URL;
const MAX_ENTRIES = 100;

function logKey(uid: string) { return `genlog:${uid}`; }

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

async function withRedis<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.disconnect(); }
}

// GET /api/genlog — return all log entries for the user
export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ entries: [] });
  try {
    const entries = await withRedis(async (client) => {
      const data = await client.get(logKey(uid));
      return data ? JSON.parse(data) as GenLogEntry[] : [];
    });
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

// POST /api/genlog — append a new log entry
export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ ok: true });
  try {
    const entry: GenLogEntry = await request.json();
    await withRedis(async (client) => {
      const data = await client.get(logKey(uid));
      const current: GenLogEntry[] = data ? JSON.parse(data) : [];
      const updated = [entry, ...current].slice(0, MAX_ENTRIES);
      await client.set(logKey(uid), JSON.stringify(updated));
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
