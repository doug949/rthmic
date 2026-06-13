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
import type { PillarType, TimedWord } from "@/app/types/pipeline";
import { normalisePillar } from "@/app/types/pipeline";
import type { SavedRhythm } from "@/app/types/library";
import { normalizeTags, tagsForSavedRhythm } from "@/app/lib/autoTags";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { libraryKey, readSavedRhythms, writeSavedRhythms } from "@/app/lib/rhythmStorage";
import { fromSunoPronunciation } from "@/app/lib/sunoLyrics";

export type { SavedRhythm };

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NEW_RTHM_WINDOW = 24 * 60 * 60 * 1000;

function legacyPairKey(rhythm: SavedRhythm): string {
  const baseTitle = rhythm.title.replace(/\s+\(Variation\)$/i, "").trim().toLowerCase();
  const lyricKey = (rhythm.lyrics ?? "").slice(0, 80);
  return `${baseTitle}:${rhythm.pillar}:${lyricKey}`;
}

function samePair(a: SavedRhythm, b: SavedRhythm): boolean {
  if (a.id === b.id) return true;
  if (a.alternateId === b.id || b.alternateId === a.id) return true;
  if (a.pairId && b.pairId && a.pairId === b.pairId) return true;
  return legacyPairKey(a) === legacyPairKey(b);
}

function restoreDisplayLyrics(rhythm: SavedRhythm): SavedRhythm {
  return rhythm.lyrics
    ? { ...rhythm, lyrics: fromSunoPronunciation(rhythm.lyrics) }
    : rhythm;
}

function librarySummary(rhythms: SavedRhythm[]) {
  const active = rhythms.filter((r) => r.status === "active" || r.status === "favourite");
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return {
    new: rhythms.filter((r) => r.status === "new").length,
    active: active.length,
    favourites: rhythms.filter((r) => r.status === "favourite").length,
    archived: rhythms.filter((r) => r.status === "archived").length,
    today: active.filter((r) => r.savedAt >= now - day).length,
    week: active.filter((r) => r.savedAt >= now - 7 * day).length,
    month: active.filter((r) => r.savedAt >= now - 30 * day).length,
  };
}

function libraryDiagnostics(rhythms: SavedRhythm[]) {
  const statusCounts = rhythms.reduce<Record<SavedRhythm["status"], number>>((counts, rhythm) => {
    counts[rhythm.status] += 1;
    return counts;
  }, { new: 0, active: 0, favourite: 0, archived: 0, deleted: 0 });
  const recordSizes = rhythms.map((rhythm) => ({
    id: rhythm.id,
    title: rhythm.title,
    status: rhythm.status,
    approxBytes: Buffer.byteLength(JSON.stringify(rhythm), "utf8"),
  }));

  return {
    totalRecords: rhythms.length,
    visibleRecords: rhythms.filter((rhythm) => rhythm.status !== "deleted").length,
    statusCounts,
    playableRecords: rhythms.filter((rhythm) => rhythm.status !== "deleted" && !!(rhythm.audioUrl || rhythm.audioKey)).length,
    rthmixTracks: rhythms.filter((rhythm) => !!rhythm.rthmixId).length,
    recordsWithTimedLyrics: rhythms.filter((rhythm) => !!rhythm.timedLyrics?.length).length,
    timedWordCount: rhythms.reduce((total, rhythm) => total + (rhythm.timedLyrics?.length ?? 0), 0),
    recordsWithLyrics: rhythms.filter((rhythm) => !!rhythm.lyrics).length,
    lyricCharacters: rhythms.reduce((total, rhythm) => total + (rhythm.lyrics?.length ?? 0), 0),
    approxMetadataBytes: recordSizes.reduce((total, record) => total + record.approxBytes, 0),
    largestRecords: recordSizes.sort((a, b) => b.approxBytes - a.approxBytes).slice(0, 5),
  };
}

// GET /api/library — fetch all rhythms (active, archived, recently deleted)
export async function GET(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Redis not configured — returning empty library");
    return NextResponse.json({ rhythms: [] });
  }

  try {
    const rhythms = await withRedis(async (client) => {
      const key = libraryKey(uid);
      const all = await readSavedRhythms(client, key);

      // Lazily purge deleted items older than 30 days
      const now = Date.now();
      const kept = all.filter(
        (r) => r.status !== "deleted" || (r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS)
      );

      // New Rthms graduate into the main library after 24 hours even if unplayed.
      const aged = kept.map((r) =>
        r.status === "new" && now - r.savedAt >= NEW_RTHM_WINDOW
          ? { ...r, status: "active" as const }
          : r
      );

      // Normalise legacy data for the response. Reads must remain read-only:
      // a full Redis instance must never make an otherwise successful read
      // look like an empty library because optional housekeeping could not save.
      return aged.map((r) => {
        const pillar = normalisePillar(r.pillar) as PillarType;
        return {
          ...restoreDisplayLyrics(r),
          pillar,
          tags: r.tags?.length ? normalizeTags(r.tags) : tagsForSavedRhythm({ ...r, pillar }),
        };
      });
    });

    if (request.nextUrl.searchParams.get("diagnostics") === "1") {
      return NextResponse.json({ diagnostics: libraryDiagnostics(rhythms) });
    }
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ summary: librarySummary(rhythms) });
    }
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
//   { action: "preferSide", id: string }                                  — set preferred A/B-side for the pair
//   { action: "archiveNonFavourites", collection?: "main"|"bridge"|"invite" } — archive all active non-favourites
//   { action: "retag" }                                                    — re-run auto-tagging across saved rhythms
export async function POST(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDIS_AVAILABLE) {
    console.warn("Redis not configured — save skipped");
    return NextResponse.json({ ok: true });
  }

  const body = await request.json();
  const { action } = body;

  if (!["save", "remove", "batch-remove", "update", "incrementPlay", "preferSide", "archiveNonFavourites", "retag"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    let retagged = 0;
    let archived = 0;
    await withRedis(async (client) => {
      const key = libraryKey(uid);
      const current = await readSavedRhythms(client, key);

      let updated: SavedRhythm[];

      if (action === "save") {
        const restored = restoreDisplayLyrics(body.rhythm);
        const rhythm: SavedRhythm = {
          ...restored,
          tags: tagsForSavedRhythm(restored),
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
      } else if (action === "preferSide") {
        const preferred = current.find((r) => r.id === body.id);
        updated = preferred
          ? current.map((r) => samePair(r, preferred) ? { ...r, preferredSideId: preferred.id } : r)
          : current;
      } else if (action === "archiveNonFavourites") {
        const collection = body.collection === "bridge" || body.collection === "invite" ? body.collection : "main";
        updated = current.map((r) => {
          const inCollection =
            !r.rthmixId &&
            (collection === "bridge"
              ? r.pillar === "Bridge"
              : collection === "invite"
                ? r.pillar === "Invite"
                : r.pillar !== "Bridge" && r.pillar !== "Invite");
          if (!inCollection || r.status !== "active") return r;
          archived++;
          return { ...r, status: "archived" as const };
        });
      } else if (action === "retag") {
        updated = current.map((r) => {
          if (r.status === "deleted") return r;
          const next = { ...r, tags: tagsForSavedRhythm(r) };
          if (JSON.stringify(next.tags ?? []) !== JSON.stringify(r.tags ?? [])) retagged++;
          return next;
        });
      } else {
        // update — status and/or tags; clears deletedAt when un-deleting
        const target = current.find((r) => r.id === body.id);
        const activatePair = !!target && body.status === "active";
        updated = current.map((r) => {
          if (r.id !== body.id && !(activatePair && target && samePair(r, target))) return r;
          const next: SavedRhythm = { ...r };
          if (body.status      !== undefined) next.status      = body.status as SavedRhythm["status"];
          if (body.tags        !== undefined) next.tags        = normalizeTags(body.tags as string[]);
          if (body.note        !== undefined) next.note        = body.note as string;
          if (body.timedLyrics !== undefined) next.timedLyrics = body.timedLyrics as TimedWord[];
          if (body.preferredSideId !== undefined) next.preferredSideId = body.preferredSideId as string;
          if (body.rthmixId !== undefined) next.rthmixId = body.rthmixId as string;
          if (body.rthmixTitle !== undefined) next.rthmixTitle = body.rthmixTitle as string;
          if (body.rthmixType !== undefined) next.rthmixType = body.rthmixType as SavedRhythm["rthmixType"];
          if (body.rthmixTrackNumber !== undefined) next.rthmixTrackNumber = body.rthmixTrackNumber as string;
          if (body.rthmixTrackRole !== undefined) next.rthmixTrackRole = body.rthmixTrackRole as SavedRhythm["rthmixTrackRole"];
          if (body.rthmixUnlock !== undefined) next.rthmixUnlock = body.rthmixUnlock as string;
          if (body.rthmixAlbumArtPrompt !== undefined) next.rthmixAlbumArtPrompt = body.rthmixAlbumArtPrompt as string;
          if (body.rthmixAlbumArtUrl !== undefined) next.rthmixAlbumArtUrl = body.rthmixAlbumArtUrl as string;
          if (next.status !== "deleted") delete next.deletedAt;
          return next;
        });
      }

      await writeSavedRhythms(client, key, updated);
    });

    return NextResponse.json({ ok: true, retagged, archived });
  } catch (err) {
    console.error("Redis write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
