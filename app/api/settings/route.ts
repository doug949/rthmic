// /api/settings — per-device user profile backed by Redis.
// Redis key: settings:{uid}  →  UserSettings (JSON)
// Falls back gracefully if Redis is unavailable.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { accessForRequest, accessForRole } from "@/app/lib/access";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import {
  emptyStylePreferences,
  STYLE_CATEGORY_IDS,
  type StyleCategoryPreference,
  type StylePreferences,
} from "@/app/types/stylePreferences";

export interface UserSettings {
  name: string;
  vocalist: "none" | "male" | "female";
  adhdMode: boolean;
  stylePreferences: StylePreferences;
}

const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  vocalist: "none",
  adhdMode: false,
  stylePreferences: emptyStylePreferences(),
};

function cleanPreference(value: unknown): StyleCategoryPreference {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    selections: Array.isArray(raw.selections)
      ? raw.selections.filter((item): item is string => typeof item === "string").map(item => item.slice(0, 100)).slice(0, 8)
      : [],
    customDescription: typeof raw.customDescription === "string" ? raw.customDescription.slice(0, 500) : "",
    overrideStyle: typeof raw.overrideStyle === "string" ? raw.overrideStyle.slice(0, 600) : "",
  };
}

function cleanStylePreferences(value: unknown): StylePreferences {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const cleaned = emptyStylePreferences();
  for (const id of STYLE_CATEGORY_IDS) cleaned[id] = cleanPreference(raw[id]);
  return cleaned;
}

function mergeSettings(raw: unknown): UserSettings {
  const parsed = raw && typeof raw === "object" ? raw as Partial<UserSettings> : {};
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    stylePreferences: cleanStylePreferences(parsed.stylePreferences),
  };
}

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
      return mergeSettings(JSON.parse(raw));
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
  if (body.stylePreferences && typeof body.stylePreferences === "object") {
    patch.stylePreferences = cleanStylePreferences(body.stylePreferences);
  }

  if (!REDIS_AVAILABLE) return NextResponse.json({ ok: true });

  try {
    await withRedis(async (client) => {
      const key = settingsKey(uid);
      const raw = await client.get(key);
      const current: UserSettings = raw ? mergeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS, stylePreferences: emptyStylePreferences() };
      const updated = { ...current, ...patch };
      await client.set(key, JSON.stringify(updated));
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Settings save error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
