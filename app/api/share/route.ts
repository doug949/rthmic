// /api/share — Rthm sharing via short-lived tokens.
//
// POST (authenticated) — create a share token for one of the caller's Rthms.
//   Body: { rhythmId: string }
//   Returns: { token: string, url: string }
//
// GET (public) — fetch the shared Rthm by token.
//   Query: ?token=xxx
//   Returns: { rhythm: SavedRhythm, sharedAt: number } | 404
//
// Redis schema: key `shr:{token}` → ShareEntry (JSON), TTL 90 days.
// Tokens are 10-character URL-safe random strings.

import { NextRequest, NextResponse } from "next/server";
import type { SavedRhythm } from "@/app/types/library";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { archiveKey, libraryKey, readSavedRhythms } from "@/app/lib/rhythmStorage";

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;

export interface ShareEntry {
  rhythm: SavedRhythm;
  sharedAt: number;
  sharedByUid: string;
}

function shrKey(token: string) {
  return `shr:${token}`;
}

/** Generate a URL-safe random token (10 chars). */
function makeToken(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l ambiguity
  let token = "";
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  for (const b of arr) token += chars[b % chars.length];
  return token;
}

// POST /api/share — create a share token
export async function POST(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rhythmId } = await request.json();
  if (!rhythmId) {
    return NextResponse.json({ error: "rhythmId required" }, { status: 400 });
  }

  if (!REDIS_AVAILABLE) {
    // Dev fallback — return a fake token so the UI can still be tested
    return NextResponse.json({ token: "devtoken", url: `${origin(request)}/r/devtoken` });
  }

  try {
    const result = await withRedis(async (client) => {
      // Fetch the rhythm from the caller's library
      const rhythms = await readSavedRhythms(client, libraryKey(uid));
      let rhythm = rhythms.find((r) => r.id === rhythmId && r.status !== "deleted");
      if (!rhythm) {
        const archivedRhythms = await readSavedRhythms(client, archiveKey(uid));
        rhythm = archivedRhythms.find((r) => r.id === rhythmId && r.status !== "deleted");
      }

      if (!rhythm) return null;

      // Create share token (retry once on collision — astronomically unlikely)
      let token = makeToken();
      if (await client.exists(shrKey(token))) token = makeToken();

      const entry: ShareEntry = { rhythm, sharedAt: Date.now(), sharedByUid: uid };
      await client.set(shrKey(token), JSON.stringify(entry), { EX: NINETY_DAYS_SEC });

      return token;
    });

    if (!result) {
      return NextResponse.json({ error: "Rhythm not found" }, { status: 404 });
    }

    const url = `${origin(request)}/r/${result}`;
    return NextResponse.json({ token: result, url });
  } catch (err) {
    console.error("Share create error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}

// GET /api/share?token=xxx — fetch a shared Rthm (public, no auth)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  if (!REDIS_AVAILABLE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const entry = await withRedis(async (client) => {
      const data = await client.get(shrKey(token));
      return data ? (JSON.parse(data) as ShareEntry) : null;
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
    }

    return NextResponse.json({ rhythm: entry.rhythm, sharedAt: entry.sharedAt });
  } catch (err) {
    console.error("Share fetch error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}

function origin(request: NextRequest): string {
  const h = request.headers.get("host") ?? "localhost:3000";
  const proto = h.startsWith("localhost") ? "http" : "https";
  return `${proto}://${h}`;
}
