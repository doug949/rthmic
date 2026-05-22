import { NextRequest, NextResponse } from "next/server";
import type { SavedRhythm } from "@/app/types/library";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { menuKey, readSavedRhythms, writeSavedRhythms } from "@/app/lib/rhythmStorage";
import { fromSunoPronunciation } from "@/app/lib/sunoLyrics";

function samePair(a: SavedRhythm, b: SavedRhythm): boolean {
  if (a.id === b.id) return true;
  if (a.pairId && b.pairId && a.pairId === b.pairId) return true;
  if (a.alternateId === b.id || b.alternateId === a.id) return true;
  const aTitle = a.title.replace(/\s+\(Variation\)$/i, "").trim().toLowerCase();
  const bTitle = b.title.replace(/\s+\(Variation\)$/i, "").trim().toLowerCase();
  return (
    aTitle.length > 0 &&
    aTitle === bTitle &&
    a.pillar === b.pillar &&
    (a.lyrics ?? "").slice(0, 80) === (b.lyrics ?? "").slice(0, 80)
  );
}

function restoreDisplayLyrics(song: SavedRhythm): SavedRhythm {
  return song.lyrics
    ? { ...song, lyrics: fromSunoPronunciation(song.lyrics) }
    : song;
}

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  if (!REDIS_AVAILABLE) return NextResponse.json({ songs: [] });

  try {
    const songs = await withRedis(async (client) => {
      const key = menuKey(uid, slug);
      const parsed = await readSavedRhythms(client, key);
      const normalised = parsed.map(restoreDisplayLyrics);
      if (JSON.stringify(normalised) !== JSON.stringify(parsed)) {
        await writeSavedRhythms(client, key, normalised);
      }
      return normalised;
    });
    return NextResponse.json({ songs });
  } catch {
    return NextResponse.json({ songs: [] });
  }
}

export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ ok: true });

  const body = await request.json();
  const { slug, action } = body as { slug: string; action?: string; songs?: SavedRhythm[]; id?: string; timedLyrics?: unknown };
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  try {
    await withRedis(async (client) => {
      const key = menuKey(uid, slug);
      if (action === "updateSong") {
        const existing = await readSavedRhythms(client, key);
        const updated = existing.map((s) =>
          s.id === body.id ? { ...s, timedLyrics: body.timedLyrics } : s
        );
        await writeSavedRhythms(client, key, updated);
      } else if (action === "preferSide") {
        const existing = await readSavedRhythms(client, key);
        const preferred = existing.find((s) => s.id === body.id);
        const updated = preferred
          ? existing.map((s) => samePair(s, preferred) ? { ...s, preferredSideId: preferred.id } : s)
          : existing;
        await writeSavedRhythms(client, key, updated);
      } else {
        // Prepend new songs to existing (newest first)
        if (!Array.isArray(body.songs)) return;
        const newSongs = (body.songs as SavedRhythm[]).map(restoreDisplayLyrics);
        const existing = await readSavedRhythms(client, key);
        await writeSavedRhythms(client, key, [...newSongs, ...existing]);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Menu save error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
