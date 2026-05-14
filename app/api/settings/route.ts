// /api/settings — per-device user profile backed by Redis.
// Redis key: settings:{uid}  →  UserSettings (JSON)
// Falls back gracefully if Redis is unavailable.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

export interface UserSettings {
  name: string;
  vocalist: "none" | "male" | "female";
  adhdMode: boolean;
  simpleMode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  vocalist: "none",
  adhdMode: false,
  simpleMode: false,
};

const REDIS_AVAILABLE = !!process.env.REDIS_URL;

function settingsKey(uid: string) {
  return `settings:${uid}`;
}

function requireUid(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

async function withRedis<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

export async function GET(request: NextRequest) {
  const uid = requireUid(request);
  if (!uid) return NextResponse.json(DEFAULT_SETTINGS);

  if (!REDIS_AVAILABLE) return NextResponse.json(DEFAULT_SETTINGS);

  try {
    const settings = await withRedis(async (client) => {
      const raw = await client.get(settingsKey(uid));
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as UserSettings;
    });
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(request: NextRequest) {
  const uid = requireUid(request);
  if (!uid) return NextResponse.json({ ok: true }); // silent no-op if not authed

  const body = await request.json();
  const patch: Partial<UserSettings> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 80);
  if (body.vocalist === "none" || body.vocalist === "male" || body.vocalist === "female") patch.vocalist = body.vocalist;
  if (typeof body.adhdMode === "boolean") patch.adhdMode = body.adhdMode;
  if (typeof body.simpleMode === "boolean") patch.simpleMode = body.simpleMode;

  if (!REDIS_AVAILABLE) return NextResponse.json({ ok: true });

  try {
    await withRedis(async (client) => {
      const key = settingsKey(uid);
      const raw = await client.get(key);
      const current: UserSettings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
      const updated = { ...current, ...patch };
      await client.set(key, JSON.stringify(updated));
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Settings save error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
