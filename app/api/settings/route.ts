// /api/settings — per-device user profile backed by Redis.
// Redis key: settings:{uid}  →  UserSettings (JSON)
// Falls back gracefully if Redis is unavailable.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { accessForRequest, accessForRole } from "@/app/lib/access";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";

export interface UserSettings {
  name: string;
  vocalist: "none" | "male" | "female";
  adhdMode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  vocalist: "none",
  adhdMode: false,
};

function settingsKey(uid: string) {
  return `settings:${uid}`;
}

export async function GET(request: NextRequest) {
  const uid = requireUserId(request);
  const fallbackAccess = accessForRole("beta");
  if (!uid) return NextResponse.json({ ...DEFAULT_SETTINGS, access: fallbackAccess, role: fallbackAccess.role });

  const access = accessForRequest(request);

  if (!REDIS_AVAILABLE) return NextResponse.json({ ...DEFAULT_SETTINGS, access, role: access.role });

  try {
    const settings = await withRedis(async (client) => {
      const raw = await client.get(settingsKey(uid));
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as UserSettings;
    });
    return NextResponse.json({ ...settings, access, role: access.role });
  } catch {
    return NextResponse.json({ ...DEFAULT_SETTINGS, access, role: access.role });
  }
}

export async function POST(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) return NextResponse.json({ ok: true }); // silent no-op if not authed

  const body = await request.json();
  const patch: Partial<UserSettings> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 80);
  if (body.vocalist === "none" || body.vocalist === "male" || body.vocalist === "female") patch.vocalist = body.vocalist;
  if (typeof body.adhdMode === "boolean") patch.adhdMode = body.adhdMode;

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
