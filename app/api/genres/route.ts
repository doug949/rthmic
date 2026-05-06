// /api/genres — store and retrieve a user's 4 genre preferences.
// Keyed by rthmic_uid (same per-user UID used by the library).
// Falls back to DEFAULT_GENRES if not set or Redis unavailable.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

export const DEFAULT_GENRES = [
  "Microhouse",
  "80s Rock",
  "Modern Musical Theatre",
  "Hip Hop",
];

const REDIS_AVAILABLE = !!process.env.REDIS_URL;

async function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("rthmic_uid")?.value;
  if (!uid || !REDIS_AVAILABLE) {
    return NextResponse.json({ genres: DEFAULT_GENRES });
  }

  const client = await getClient();
  try {
    const raw = await client.get(`genres:${uid}`);
    if (!raw) return NextResponse.json({ genres: DEFAULT_GENRES });
    return NextResponse.json({ genres: JSON.parse(raw) });
  } finally {
    await client.disconnect();
  }
}

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("rthmic_uid")?.value;
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { genres } = await req.json();
  if (!Array.isArray(genres) || genres.length !== 4 || genres.some((g) => typeof g !== "string" || !g.trim())) {
    return NextResponse.json({ error: "Must provide exactly 4 non-empty genre strings" }, { status: 400 });
  }

  if (!REDIS_AVAILABLE) {
    return NextResponse.json({ ok: true }); // dev fallback
  }

  const client = await getClient();
  try {
    await client.set(
      `genres:${uid}`,
      JSON.stringify(genres.map((g: string) => g.trim())),
      { EX: 60 * 60 * 24 * 365 }
    );
    return NextResponse.json({ ok: true });
  } finally {
    await client.disconnect();
  }
}
