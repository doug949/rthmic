import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import type { SavedRhythm } from "@/app/api/library/route";
import type { ShareEntry } from "@/app/api/share/route";
import { getWasabiSignedUrl } from "@/app/lib/wasabiUpload";

export const maxDuration = 30;

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^\w\s\-']/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120) || "rthm"
  ) + ".mp3";
}

async function resolveAudioUrl(rhythm: SavedRhythm): Promise<string | null> {
  // Prefer permanent Wasabi storage
  if (rhythm.audioKey) {
    try { return await getWasabiSignedUrl(rhythm.audioKey); } catch { /* fall through */ }
  }
  // Fall back to stored Suno URL
  return rhythm.audioUrl ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const rhythmId = req.nextUrl.searchParams.get("id");
  const rawName  = req.nextUrl.searchParams.get("filename") ?? "rthm";

  if (!token && !rhythmId) return new NextResponse("id or token required", { status: 400 });
  if (!process.env.REDIS_URL) return new NextResponse("Not configured", { status: 500 });

  let rhythm: SavedRhythm | null = null;
  try {
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    if (token) {
      const raw = await client.get(`shr:${token}`);
      const entry = raw ? JSON.parse(raw) as ShareEntry : null;
      rhythm = entry?.rhythm ?? null;
    } else {
      const uid = requireAuth(req);
      if (!uid) {
        await client.disconnect();
        return new NextResponse("Unauthorized", { status: 401 });
      }
      const raw = await client.get(`lib:${uid}`);
      if (raw) {
        const all: SavedRhythm[] = JSON.parse(raw);
        rhythm = all.find((r) => r.id === rhythmId) ?? null;
      }
    }
    await client.disconnect();
  } catch { /* fall through */ }

  if (!rhythm) return new NextResponse("Not found", { status: 404 });

  const audioUrl = await resolveAudioUrl(rhythm);
  if (!audioUrl) return new NextResponse("No audio available", { status: 404 });

  const filename = sanitizeFilename(rawName.replace(/\.mp3$/i, ""));

  let upstream: Response;
  try {
    upstream = await fetch(audioUrl, { headers: { "User-Agent": "RTHMIC/1.0" } });
  } catch {
    return new NextResponse("Failed to reach audio source", { status: 502 });
  }

  if (!upstream.ok) return new NextResponse("Audio source error", { status: 502 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
