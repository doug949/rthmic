import { createClient } from "redis";
import type { SavedRhythm } from "@/app/types/library";

export type RedisClient = ReturnType<typeof createClient>;

export function libraryKey(uid: string): string {
  return `lib:${uid}`;
}

export function menuKey(uid: string, slug: string): string {
  return `menu:${uid}:${slug}`;
}

export async function readSavedRhythms(
  client: RedisClient,
  key: string
): Promise<SavedRhythm[]> {
  const raw = await client.get(key);
  return raw ? JSON.parse(raw) : [];
}

export async function writeSavedRhythms(
  client: RedisClient,
  key: string,
  rhythms: SavedRhythm[]
): Promise<void> {
  await client.set(key, JSON.stringify(rhythms));
}

export async function prependUniqueSavedRhythms(
  client: RedisClient,
  key: string,
  rhythms: SavedRhythm[]
): Promise<number> {
  const existing = await readSavedRhythms(client, key);
  const existingIds = new Set(existing.map((r) => r.id));
  const fresh = rhythms.filter((r) => !existingIds.has(r.id));
  if (!fresh.length) return 0;
  await writeSavedRhythms(client, key, [...fresh, ...existing]);
  return fresh.length;
}
