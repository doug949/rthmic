import { createClient } from "redis";
import type { SavedRhythm } from "@/app/types/library";
import type { PillarType, Song, TimedWord } from "@/app/types/pipeline";
import { tagsForSavedRhythm } from "@/app/lib/autoTags";
import {
  libraryKey,
  menuKey,
  prependUniqueSavedRhythms,
  readSavedRhythms,
  type RedisClient,
  writeSavedRhythms,
} from "@/app/lib/rhythmStorage";
import { uploadAudioToWasabi } from "@/app/lib/wasabiUpload";

const APP_URL = "https://rthmic.app";

interface SaveCompletedSongsParams {
  client: RedisClient;
  userId: string;
  jobId: string;
  pillar: PillarType;
  lyrics: string;
  songs: Song[];
  note?: string;
  menuSlug?: string;
}

async function saveToLibrary(
  client: RedisClient,
  userId: string,
  rhythm: SavedRhythm
): Promise<boolean> {
  return (await prependUniqueSavedRhythms(client, libraryKey(userId), [rhythm])) === 1;
}

async function saveToMenu(
  client: RedisClient,
  userId: string,
  slug: string,
  rhythms: SavedRhythm[]
): Promise<number> {
  return prependUniqueSavedRhythms(client, menuKey(userId, slug), rhythms);
}

async function attachTimedLyrics(userId: string, songId: string, taskId: string, audioId: string, menuSlug?: string) {
  try {
    const res = await fetch(`${APP_URL}/api/timed-lyrics?taskId=${encodeURIComponent(taskId)}&audioId=${encodeURIComponent(audioId)}`);
    if (!res.ok) return;
    const data = await res.json() as { timedWords?: TimedWord[] };
    if (!data.timedWords?.length) return;

    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    try {
      const key = menuSlug ? menuKey(userId, menuSlug) : libraryKey(userId);
      const all = await readSavedRhythms(client, key);
      const idx = all.findIndex((r) => r.id === songId);
      if (idx !== -1) {
        all[idx].timedLyrics = data.timedWords;
        await writeSavedRhythms(client, key, all);
      }
    } finally {
      await client.disconnect();
    }
  } catch {
    // Timed lyrics are useful, but playback should never wait on them.
  }
}

export async function saveCompletedSongs({
  client,
  userId,
  jobId,
  pillar,
  lyrics,
  songs,
  note,
  menuSlug,
}: SaveCompletedSongsParams): Promise<{ saved: number; rhythms: SavedRhythm[] }> {
  const pairId = songs.length > 1 ? jobId : undefined;
  const rhythms: SavedRhythm[] = [];
  let saved = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const wasabiKey = `rhythms/${userId}/${song.id}.mp3`;
    let audioKey: string | undefined;

    if (song.audioUrl) {
      try {
        audioKey = await uploadAudioToWasabi(song.audioUrl, wasabiKey);
        console.log(`[generation] Wasabi upload done before save: ${wasabiKey}`);
      } catch (e) {
        console.warn(`[generation] Wasabi upload failed before save for ${song.id}, saving Suno fallback:`, e);
      }
    }

    const rhythm: SavedRhythm = {
      id: song.id,
      title: song.title,
      pillar,
      audioUrl: song.audioUrl,
      lyrics,
      sunoClipId: song.sunoClipId,
      sunoTaskId: song.sunoTaskId,
      savedAt: Date.now(),
      status: menuSlug ? "active" : "new",
      ...(pairId ? {
        pairId,
        side: (i === 0 ? "A" : "B") as "A" | "B",
        alternateId: songs[i === 0 ? 1 : 0]?.id,
      } : {}),
      ...(audioKey ? { audioKey } : {}),
      ...(note ? { note } : {}),
    };

    if (!menuSlug) rhythm.tags = tagsForSavedRhythm(rhythm);
    rhythms.push(rhythm);

    if (song.sunoClipId && song.sunoTaskId) {
      attachTimedLyrics(userId, song.id, song.sunoTaskId, song.sunoClipId, menuSlug).catch(() => {});
    }
  }

  if (menuSlug) {
    saved = await saveToMenu(client, userId, menuSlug, rhythms);
  } else {
    for (const rhythm of rhythms) {
      if (await saveToLibrary(client, userId, rhythm)) saved++;
    }
  }

  return { saved, rhythms };
}
