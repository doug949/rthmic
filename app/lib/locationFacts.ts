interface Coordinate {
  latitude: number;
  longitude: number;
}

interface NearbyPlace {
  name: string;
  kind?: string;
  detail?: string;
  distanceMeters?: number;
}

interface WikipediaPlace {
  title: string;
  summary?: string;
  distanceMeters?: number;
  url?: string;
}

function isFiniteCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function parseCoordinatePair(value?: string | null): Coordinate | null {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function compact(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : undefined;
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const radius = 6371000;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

async function fetchJson<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "RTHMIC/1.0 (https://rthmic.app; local-facts-enrichment)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function reverseGeocode(coord: Coordinate): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(coord.latitude));
  url.searchParams.set("lon", String(coord.longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  const data = await fetchJson<{ display_name?: string; name?: string; category?: string; type?: string }>(url.toString());
  const label = compact(data?.name) ?? compact(data?.display_name);
  if (!label) return null;
  const type = [compact(data?.category), compact(data?.type)].filter(Boolean).join("/");
  return type ? `${label} (${type})` : label;
}

async function nearbyWikipedia(coord: Coordinate): Promise<WikipediaPlace[]> {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "geosearch");
  searchUrl.searchParams.set("gscoord", `${coord.latitude}|${coord.longitude}`);
  searchUrl.searchParams.set("gsradius", "1500");
  searchUrl.searchParams.set("gslimit", "5");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const search = await fetchJson<{ query?: { geosearch?: Array<{ title?: string; dist?: number }> } }>(searchUrl.toString());
  const items = search?.query?.geosearch ?? [];
  const summaries = await Promise.all(items.slice(0, 4).map(async (item) => {
    const title = compact(item.title);
    if (!title) return null;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summary = await fetchJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(summaryUrl);
    const place: WikipediaPlace = { title };
    const extract = compact(summary?.extract)?.slice(0, 360);
    const pageUrl = compact(summary?.content_urls?.desktop?.page);
    if (extract) place.summary = extract;
    if (typeof item.dist === "number") place.distanceMeters = Math.round(item.dist);
    if (pageUrl) place.url = pageUrl;
    return place;
  }));

  return summaries.filter((item): item is WikipediaPlace => Boolean(item));
}

function overpassName(tags: Record<string, unknown>): string | undefined {
  return compact(tags.name) ?? compact(tags["addr:housename"]) ?? compact(tags["addr:place"]);
}

function overpassKind(tags: Record<string, unknown>): string | undefined {
  const historic = compact(tags.historic);
  if (historic) return `historic ${historic}`;
  const tourism = compact(tags.tourism);
  if (tourism) return `tourism ${tourism}`;
  const amenity = compact(tags.amenity);
  if (amenity) return amenity;
  const leisure = compact(tags.leisure);
  if (leisure) return `leisure ${leisure}`;
  const railway = compact(tags.railway);
  if (railway) return `railway ${railway}`;
  const publicTransport = compact(tags.public_transport);
  if (publicTransport) return `public transport ${publicTransport}`;
  const shop = compact(tags.shop);
  if (shop) return `${shop} shop`;
  const office = compact(tags.office);
  if (office) return `${office} office`;
  const building = compact(tags.building);
  if (building && building !== "yes") return `${building} building`;
  if (building) return "building";
  const heritage = compact(tags.heritage);
  if (heritage) return `heritage ${heritage}`;
  return undefined;
}

async function nearbyOpenStreetMap(coord: Coordinate): Promise<NearbyPlace[]> {
  const query = `
    [out:json][timeout:5];
    (
      node(around:900,${coord.latitude},${coord.longitude})[~"^(name|addr:housename|addr:place)$"~"."][~"^(historic|tourism|amenity|building|heritage|leisure|railway|public_transport|shop|office)$"~"."];
      way(around:900,${coord.latitude},${coord.longitude})[~"^(name|addr:housename|addr:place)$"~"."][~"^(historic|tourism|amenity|building|heritage|leisure|railway|public_transport|shop|office)$"~"."];
      relation(around:900,${coord.latitude},${coord.longitude})[~"^(name|addr:housename|addr:place)$"~"."][~"^(historic|tourism|amenity|building|heritage|leisure|railway|public_transport|shop|office)$"~"."];
    );
    out center tags 24;
  `;
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", query);
  const data = await fetchJson<{ elements?: Array<{ lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, unknown> }> }>(url.toString(), 6500);
  const origin = coord;
  const seen = new Set<string>();

  return (data?.elements ?? [])
    .map((element) => {
      const tags = element.tags ?? {};
      const name = overpassName(tags);
      if (!name || seen.has(name.toLowerCase())) return null;
      seen.add(name.toLowerCase());
      const lat = typeof element.lat === "number" ? element.lat : element.center?.lat;
      const lon = typeof element.lon === "number" ? element.lon : element.center?.lon;
      const detail = [
        compact(tags.start_date) ? `start date ${compact(tags.start_date)}` : "",
        compact(tags["addr:housenumber"]) && compact(tags["addr:street"]) ? `${compact(tags["addr:housenumber"])} ${compact(tags["addr:street"])}` : "",
        compact(tags["addr:street"]),
        compact(tags["addr:postcode"]),
        compact(tags.website) ?? compact(tags.wikidata),
      ].filter(Boolean).join("; ");
      const place: NearbyPlace = { name };
      const kind = overpassKind(tags);
      if (kind) place.kind = kind;
      if (detail) place.detail = detail;
      if (typeof lat === "number" && typeof lon === "number") {
        place.distanceMeters = Math.round(haversineMeters(origin, { latitude: lat, longitude: lon }));
      }
      return place;
    })
    .filter((item): item is NearbyPlace => Boolean(item))
    .sort((a, b) => (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999))
    .slice(0, 8);
}

export async function buildLocationFacts(coord: Coordinate | null): Promise<string> {
  if (!coord || !isFiniteCoordinate(coord.latitude, coord.longitude)) return "";

  const [reverse, wiki, osm] = await Promise.all([
    reverseGeocode(coord),
    nearbyWikipedia(coord),
    nearbyOpenStreetMap(coord),
  ]);

  const lines: string[] = [
    `Coordinates used for local facts: ${coord.latitude.toFixed(6)}, ${coord.longitude.toFixed(6)}.`,
  ];
  if (reverse) lines.push(`Reverse geocode: ${reverse}.`);
  if (wiki.length) {
    lines.push("Nearby Wikipedia facts:");
    for (const item of wiki) {
      lines.push(`- ${item.title}${item.distanceMeters !== undefined ? `, about ${item.distanceMeters}m away` : ""}: ${item.summary ?? "No summary available."}${item.url ? ` Source: ${item.url}` : ""}`);
    }
  }
  if (osm.length) {
    lines.push("Named nearby OpenStreetMap places/features:");
    for (const place of osm) {
      lines.push(`- ${place.name}${place.kind ? ` (${place.kind})` : ""}${place.distanceMeters !== undefined ? `, about ${place.distanceMeters}m away` : ""}${place.detail ? `; ${place.detail}` : ""}.`);
    }
  }

  if (lines.length === 1) {
    lines.push("No named nearby facts were found from the geodata lookup.");
  }
  return lines.join("\n");
}
