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
import { archiveKey, libraryKey, readSavedRhythms, writeSavedRhythms } from "@/app/lib/rhythmStorage";
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

function uniqueRhythms(...groups: SavedRhythm[][]): SavedRhythm[] {
  const seen = new Set<string>();
  return groups.flat().filter((rhythm) => {
    if (seen.has(rhythm.id)) return false;
    seen.add(rhythm.id);
    return true;
  });
}

function normaliseForResponse(rhythms: SavedRhythm[]): SavedRhythm[] {
  return rhythms.map((r) => {
    const pillar = normalisePillar(r.pillar) as PillarType;
    return {
      ...restoreDisplayLyrics(r),
      pillar,
      tags: r.tags?.length ? normalizeTags(r.tags) : tagsForSavedRhythm({ ...r, pillar }),
    };
  });
}

// GET /api/library — fetch the active library by default.
// Archived and deleted records stay out of normal app payloads so a large
// archive does not add work to every library consumer.
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
    const requestedId = request.nextUrl.searchParams.get("id");
    const scope = request.nextUrl.searchParams.get("scope");
    const wantsAll = scope === "all" || request.nextUrl.searchParams.get("diagnostics") === "1" || request.nextUrl.searchParams.get("summary") === "1";

    const { activeRhythms, archivedRhythms } = await withRedis(async (client) => {
      const all = await readSavedRhythms(client, libraryKey(uid));

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

      const active = aged.filter((rhythm) => rhythm.status !== "archived");
      const legacyArchived = aged.filter((rhythm) => rhythm.status === "archived");
      let archived: SavedRhythm[] = legacyArchived;
      if (scope === "archived" || wantsAll || (requestedId && !active.some((rhythm) => rhythm.id === requestedId))) {
        archived = uniqueRhythms(await readSavedRhythms(client, archiveKey(uid)), legacyArchived);
      }
      return { activeRhythms: active, archivedRhythms: archived };
    });

    const allRhythms = wantsAll ? uniqueRhythms(activeRhythms, archivedRhythms) : activeRhythms;

    if (request.nextUrl.searchParams.get("diagnostics") === "1") {
      return NextResponse.json({ diagnostics: libraryDiagnostics(allRhythms) });
    }
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ summary: librarySummary(allRhythms) });
    }

    let selected: SavedRhythm[];
    if (requestedId) {
      const available = uniqueRhythms(activeRhythms, archivedRhythms);
      const requested = available.find((rhythm) => rhythm.id === requestedId);
      selected = requested
        ? available.filter((rhythm) => samePair(rhythm, requested) && rhythm.status !== "deleted")
        : [];
    } else if (scope === "archived") {
      selected = archivedRhythms.filter((rhythm) => rhythm.status === "archived");
    } else if (scope === "all") {
      selected = allRhythms;
    } else {
      selected = activeRhythms.filter((rhythm) => rhythm.status !== "deleted");
    }

    // Normalise only the records this caller needs. Reads remain read-only:
    // optional housekeeping must never turn a successful read into an empty library.
    const rhythms = normaliseForResponse(selected);
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
      const activeKey = libraryKey(uid);
      const storedArchiveKey = archiveKey(uid);
      const current = await readSavedRhythms(client, activeKey);

      if (action === "save") {
        const restored = restoreDisplayLyrics(body.rhythm);
        const rhythm: SavedRhythm = {
          ...restored,
          tags: tagsForSavedRhythm(restored),
          savedAt: Date.now(),
          status: "active",
        };
        await writeSavedRhythms(client, activeKey, [rhythm, ...current.filter((r) => r.id !== rhythm.id)]);
      } else if (action === "remove") {
        if (current.some((r) => r.id === body.id)) {
          await writeSavedRhythms(client, activeKey, current.map((r) =>
            r.id === body.id ? { ...r, status: "deleted" as const, deletedAt: Date.now() } : r
          ));
        } else {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          await writeSavedRhythms(client, storedArchiveKey, storedArchive.map((r) =>
            r.id === body.id ? { ...r, status: "deleted" as const, deletedAt: Date.now() } : r
          ));
        }
      } else if (action === "batch-remove") {
        const ids = new Set<string>(body.ids ?? []);
        await writeSavedRhythms(client, activeKey, current.map((r) =>
          ids.has(r.id) ? { ...r, status: "deleted" as const, deletedAt: Date.now() } : r
        ));
      } else if (action === "incrementPlay") {
        if (current.some((r) => r.id === body.id)) {
          await writeSavedRhythms(client, activeKey, current.map((r) =>
            r.id === body.id ? { ...r, playCount: (r.playCount ?? 0) + 1, lastPlayedAt: Date.now() } : r
          ));
        } else {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          if (storedArchive.some((r) => r.id === body.id)) {
            await writeSavedRhythms(client, storedArchiveKey, storedArchive.map((r) =>
              r.id === body.id ? { ...r, playCount: (r.playCount ?? 0) + 1, lastPlayedAt: Date.now() } : r
            ));
          }
        }
      } else if (action === "preferSide") {
        const preferred = current.find((r) => r.id === body.id);
        if (preferred) {
          await writeSavedRhythms(client, activeKey, current.map((r) =>
            samePair(r, preferred) ? { ...r, preferredSideId: preferred.id } : r
          ));
        } else {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          const archivedPreferred = storedArchive.find((r) => r.id === body.id);
          if (archivedPreferred) {
            await writeSavedRhythms(client, storedArchiveKey, storedArchive.map((r) =>
              samePair(r, archivedPreferred) ? { ...r, preferredSideId: archivedPreferred.id } : r
            ));
          }
        }
      } else if (action === "archiveNonFavourites") {
        const collection = body.collection === "bridge" || body.collection === "invite" ? body.collection : "main";
        const isInCollection = (rhythm: SavedRhythm) =>
          !rhythm.rthmixId &&
          (collection === "bridge"
            ? rhythm.pillar === "Bridge"
            : collection === "invite"
              ? rhythm.pillar === "Invite"
              : rhythm.pillar !== "Bridge" && rhythm.pillar !== "Invite");
        const favourites = current.filter((rhythm) =>
          isInCollection(rhythm) && rhythm.status === "favourite"
        );
        const moving = current.filter((r) =>
          isInCollection(r) && r.status === "active" && !favourites.some((favourite) => samePair(r, favourite))
        );
        archived = moving.length;
        const movingIds = new Set(moving.map((r) => r.id));
        const storedArchive = await readSavedRhythms(client, storedArchiveKey);
        await writeSavedRhythms(client, storedArchiveKey, uniqueRhythms(
          moving.map((r) => ({ ...r, status: "archived" as const })),
          storedArchive,
        ));
        await writeSavedRhythms(client, activeKey, current.filter((r) => !movingIds.has(r.id)));
      } else if (action === "retag") {
        const updated = current.map((r) => {
          if (r.status === "deleted") return r;
          const next = { ...r, tags: tagsForSavedRhythm(r) };
          if (JSON.stringify(next.tags ?? []) !== JSON.stringify(r.tags ?? [])) retagged++;
          return next;
        });
        await writeSavedRhythms(client, activeKey, updated);
      } else {
        // Update, archive, or restore. Archive transitions physically move records.
        const target = current.find((r) => r.id === body.id);
        if (target && body.status === "archived") {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          const moved = { ...target, status: "archived" as const };
          await writeSavedRhythms(client, storedArchiveKey, uniqueRhythms([moved], storedArchive));
          await writeSavedRhythms(client, activeKey, current.filter((r) => r.id !== target.id));
          archived = 1;
          return;
        }

        if (!target && body.status === "active") {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          const archivedTarget = storedArchive.find((r) => r.id === body.id);
          if (!archivedTarget) return;
          const restoring = storedArchive.filter((r) => samePair(r, archivedTarget) && r.status === "archived");
          const restoringIds = new Set(restoring.map((r) => r.id));
          await writeSavedRhythms(client, activeKey, uniqueRhythms(
            restoring.map((r) => ({ ...r, status: "active" as const, deletedAt: undefined })),
            current,
          ));
          await writeSavedRhythms(client, storedArchiveKey, storedArchive.filter((r) => !restoringIds.has(r.id)));
          return;
        }

        const updateRecords = (records: SavedRhythm[], updateTarget: SavedRhythm) => records.map((r) => {
          if (r.id !== updateTarget.id) return r;
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
        if (target) {
          await writeSavedRhythms(client, activeKey, updateRecords(current, target));
        } else {
          const storedArchive = await readSavedRhythms(client, storedArchiveKey);
          const archivedTarget = storedArchive.find((r) => r.id === body.id);
          if (archivedTarget) {
            await writeSavedRhythms(client, storedArchiveKey, updateRecords(storedArchive, archivedTarget));
          }
        }
      }
    });

    return NextResponse.json({ ok: true, retagged, archived });
  } catch (err) {
    console.error("Redis write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
