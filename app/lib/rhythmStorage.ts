import type { SavedRhythm } from "@/app/types/library";
import type { RedisClient } from "@/app/lib/redis";
import { gzipSync, gunzipSync } from "node:zlib";

const COMPRESSED_PREFIX = "gz:";

function encodeSavedRhythms(rhythms: SavedRhythm[]): string {
  const json = JSON.stringify(rhythms);
  return `${COMPRESSED_PREFIX}${gzipSync(json, { level: 6 }).toString("base64")}`;
}

function decodeSavedRhythms(raw: string): SavedRhythm[] {
  if (!raw.startsWith(COMPRESSED_PREFIX)) return JSON.parse(raw) as SavedRhythm[];
  const compressed = Buffer.from(raw.slice(COMPRESSED_PREFIX.length), "base64");
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as SavedRhythm[];
}

export function libraryKey(uid: string): string {
  return `lib:${uid}`;
}

export function archiveKey(uid: string): string {
  return `archive:${uid}`;
}

export function menuKey(uid: string, slug: string): string {
  return `menu:${uid}:${slug}`;
}

export async function readSavedRhythms(
  client: RedisClient,
  key: string
): Promise<SavedRhythm[]> {
  const raw = await client.get(key);
  return raw ? decodeSavedRhythms(raw) : [];
}

export async function writeSavedRhythms(
  client: RedisClient,
  key: string,
  rhythms: SavedRhythm[]
): Promise<void> {
  await client.set(key, encodeSavedRhythms(rhythms));
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
