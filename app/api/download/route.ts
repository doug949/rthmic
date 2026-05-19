import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const ALLOWED_HOSTS = [".suno.ai", ".suno.com"];

function isSafeAudioUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => u.hostname === h.slice(1) || u.hostname.endsWith(h));
  } catch {
    return false;
  }
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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const rawName = req.nextUrl.searchParams.get("filename") ?? "rthm";

  if (!url || !isSafeAudioUrl(url)) {
    return new NextResponse("Invalid or disallowed URL", { status: 400 });
  }

  const filename = sanitizeFilename(rawName.replace(/\.mp3$/i, ""));

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { "User-Agent": "RTHMIC/1.0" } });
  } catch {
    return new NextResponse("Failed to reach audio source", { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse("Audio source returned an error", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
