import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

const GOOGLE_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return GOOGLE_MAPS_HOSTS.has(host) || host.endsWith(".google.com");
  } catch {
    return false;
  }
}

function cleanToken(value: string): string {
  return decodeURIComponent(value)
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCoordinates(url: URL): string | null {
  const atMatch = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;

  for (const key of ["q", "query", "ll", "center", "destination", "origin"]) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const coordMatch = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (coordMatch) return `${coordMatch[1]}, ${coordMatch[2]}`;
  }

  return null;
}

function extractMapLabel(url: URL): string | null {
  const query = url.searchParams.get("query") ?? url.searchParams.get("q") ?? url.searchParams.get("destination");
  if (query && !/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(query)) return cleanToken(query);

  const segments = url.pathname.split("/").filter(Boolean);
  const placeIndex = segments.findIndex((segment) => segment === "place" || segment === "search");
  if (placeIndex !== -1 && segments[placeIndex + 1]) return cleanToken(segments[placeIndex + 1]);

  const dirIndex = segments.findIndex((segment) => segment === "dir");
  if (dirIndex !== -1) {
    const stops = segments
      .slice(dirIndex + 1)
      .filter((segment) => segment && !segment.startsWith("@") && !segment.includes("data="))
      .map(cleanToken)
      .filter(Boolean);
    if (stops.length) return stops.join(" to ");
  }

  const lastNamed = segments
    .filter((segment) => !segment.startsWith("@") && !segment.includes("data=") && segment !== "maps")
    .map(cleanToken)
    .filter(Boolean)
    .pop();

  return lastNamed ?? null;
}

async function resolveGoogleMapsUrl(input: string): Promise<string> {
  try {
    const res = await fetch(input, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RTHMIC/1.0; +https://rthmic.app)",
      },
      signal: AbortSignal.timeout(8000),
    });
    return res.url || input;
  } catch {
    return input;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const context = typeof body.context === "string" ? body.context.trim() : "";

    if (!rawUrl) return NextResponse.json({ error: "Google Maps link required" }, { status: 400 });
    if (!isGoogleMapsUrl(rawUrl)) {
      return NextResponse.json({ error: "Please use a Google Maps link" }, { status: 400 });
    }

    const resolvedUrl = await resolveGoogleMapsUrl(rawUrl);
    const parsed = new URL(resolvedUrl);
    const label = extractMapLabel(parsed);
    const coordinates = extractCoordinates(parsed);

    const seed = [
      "Developer experiment: Walking Tour from Google Maps.",
      `Google Maps link: ${rawUrl}`,
      resolvedUrl !== rawUrl ? `Resolved link: ${resolvedUrl}` : "",
      label ? `Map label or route: ${label}` : "",
      coordinates ? `Map coordinates: ${coordinates}` : "",
      context ? `User context: ${context}` : "User context: Create a useful walking-tour companion for this place or route.",
      "Create a Rthm that works as an audio walking-tour companion. It should be paced for someone walking, looking around, and making sense of the place.",
      "Use only details that come from the map label, coordinates, URL, and user context. Do not invent landmarks, history, businesses, or facts that were not provided.",
      "Make it practical: what to notice, where to slow down, what questions to carry, what tradeoffs or atmosphere to remember, and how to stay present while moving.",
    ].filter(Boolean).join(" ");

    return NextResponse.json({ seed, resolvedUrl, label, coordinates });
  } catch (err) {
    console.error("Walking tour link error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read Google Maps link" },
      { status: 500 }
    );
  }
}
