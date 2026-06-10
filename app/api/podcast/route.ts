import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { libraryKey, readSavedRhythms, writeSavedRhythms } from "@/app/lib/rhythmStorage";
import { parsePodcastContent } from "@/app/lib/podcast";
import type { SavedRhythm } from "@/app/types/library";

const PODCAST_CONTENT_KEY = "rthmic:podcast:content";
const FEATURED_TAG = "rthmic podcast featured tracks";

async function readPodcastContent() {
  if (REDIS_AVAILABLE) {
    const redisContent = await withRedis((client) => client.get(PODCAST_CONTENT_KEY));
    if (redisContent) return parsePodcastContent(redisContent);
  }
  return parsePodcastContent(process.env.RTHMIC_PODCAST_CONTENT);
}

export async function GET(request: NextRequest) {
  if (!requireUserId(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await readPodcastContent());
  } catch (error) {
    console.error("Podcast content read failed:", error);
    return NextResponse.json({ episodes: [], featuredTracks: [] });
  }
}

export async function POST(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });

  const body = await request.json();
  if (body.action !== "addFeaturedTrack" || typeof body.trackId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const content = await readPodcastContent();
    const featured = content.featuredTracks.find((track) => track.id === body.trackId);
    if (!featured) return NextResponse.json({ error: "Featured track not found" }, { status: 404 });

    const savedId = `podcast-${featured.id}`;
    await withRedis(async (client) => {
      const key = libraryKey(uid);
      const current = await readSavedRhythms(client, key);
      const existing = current.find((rhythm) => rhythm.id === savedId);
      const rhythm: SavedRhythm = {
        id: savedId,
        title: featured.title,
        pillar: featured.pillar,
        audioUrl: featured.audioUrl,
        audioKey: featured.audioKey,
        lyrics: featured.lyrics,
        savedAt: existing?.savedAt ?? Date.now(),
        status: "favourite",
        tags: Array.from(new Set([FEATURED_TAG, ...(featured.tags ?? [])])),
        note: featured.creatorName ? `Featured on the RTHMIC Podcast. Created by ${featured.creatorName}.` : "Featured on the RTHMIC Podcast.",
      };
      await writeSavedRhythms(client, key, [rhythm, ...current.filter((item) => item.id !== savedId)]);
    });

    return NextResponse.json({ ok: true, id: savedId });
  } catch (error) {
    console.error("Podcast track import failed:", error);
    return NextResponse.json({ error: "Could not add track" }, { status: 500 });
  }
}
