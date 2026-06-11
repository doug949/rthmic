import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildLocationFacts } from "@/app/lib/locationFacts";

export const maxDuration = 45;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_METADATA_IMAGE_BYTES = 768 * 1024;

interface ExifMetadata {
  capturedAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  orientation?: number;
  focalLengthMm?: number;
  gps?: {
    latitude?: number;
    longitude?: number;
    altitudeMeters?: number;
    imageDirectionDegrees?: number;
    dateStamp?: string;
  };
}

function supportedMediaType(type: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (type === "image/jpeg" || type === "image/png" || type === "image/gif" || type === "image/webp") return type;
  return null;
}

function readString(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return new TextDecoder("ascii").decode(bytes).replace(/\0+$/, "").trim();
}

function readRational(view: DataView, offset: number, little: boolean): number | undefined {
  const numerator = view.getUint32(offset, little);
  const denominator = view.getUint32(offset + 4, little);
  if (!denominator) return undefined;
  return numerator / denominator;
}

function readSignedRational(view: DataView, offset: number, little: boolean): number | undefined {
  const numerator = view.getInt32(offset, little);
  const denominator = view.getInt32(offset + 4, little);
  if (!denominator) return undefined;
  return numerator / denominator;
}

function readExifValue(view: DataView, tiffStart: number, entryOffset: number, little: boolean): unknown {
  const type = view.getUint16(entryOffset + 2, little);
  const count = view.getUint32(entryOffset + 4, little);
  const valueOffset = entryOffset + 8;
  const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = (typeSize[type] ?? 1) * count;
  const dataOffset = size <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, little);

  if (dataOffset < 0 || dataOffset >= view.byteLength) return undefined;

  if (type === 2) return readString(view, dataOffset, count);
  if (type === 3) return count === 1
    ? view.getUint16(dataOffset, little)
    : Array.from({ length: count }, (_, i) => view.getUint16(dataOffset + i * 2, little));
  if (type === 4) return count === 1
    ? view.getUint32(dataOffset, little)
    : Array.from({ length: count }, (_, i) => view.getUint32(dataOffset + i * 4, little));
  if (type === 5) return count === 1
    ? readRational(view, dataOffset, little)
    : Array.from({ length: count }, (_, i) => readRational(view, dataOffset + i * 8, little));
  if (type === 9) return view.getInt32(dataOffset, little);
  if (type === 10) return count === 1
    ? readSignedRational(view, dataOffset, little)
    : Array.from({ length: count }, (_, i) => readSignedRational(view, dataOffset + i * 8, little));

  return undefined;
}

function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean): Map<number, unknown> {
  const values = new Map<number, unknown>();
  const absolute = tiffStart + ifdOffset;
  if (absolute < 0 || absolute + 2 > view.byteLength) return values;

  const count = view.getUint16(absolute, little);
  for (let i = 0; i < count; i++) {
    const entryOffset = absolute + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, little);
    values.set(tag, readExifValue(view, tiffStart, entryOffset, little));
  }
  return values;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanTagHint(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 +#-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 32)
    .trim();
}

function parseVisionJson(text: string): { prompt: string; tagHints: string[]; musicStyle: string } {
  try {
    const trimmed = text.trim();
    const jsonText = trimmed.startsWith("{")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "";
    const parsed = JSON.parse(jsonText) as { prompt?: unknown; tagHints?: unknown; musicStyle?: unknown };
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    const musicStyle = typeof parsed.musicStyle === "string"
      ? parsed.musicStyle
          .replace(/\s+/g, " ")
          .replace(/[|{}[\]]/g, "")
          .trim()
          .slice(0, 190)
      : "";
    const tagHints = Array.isArray(parsed.tagHints)
      ? parsed.tagHints
          .filter((tag): tag is string => typeof tag === "string")
          .map(cleanTagHint)
          .filter(Boolean)
          .slice(0, 8)
      : [];
    if (prompt) return { prompt, tagHints, musicStyle };
  } catch {
    // Fall through to plain-text handling below.
  }
  return { prompt: text.trim(), tagHints: [], musicStyle: "" };
}

function dmsToDecimal(value: unknown, ref: unknown): number | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const degrees = numberValue(value[0]);
  const minutes = numberValue(value[1]);
  const seconds = numberValue(value[2]);
  if (degrees === undefined || minutes === undefined || seconds === undefined) return undefined;
  const sign = stringValue(ref)?.toUpperCase() === "S" || stringValue(ref)?.toUpperCase() === "W" ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function findExifView(buffer: ArrayBuffer): DataView | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && readString(view, offset + 4, 6) === "Exif") {
      return new DataView(buffer, offset + 10, length - 8);
    }
    offset += 2 + length;
  }

  return null;
}

function parseExif(buffer: ArrayBuffer): ExifMetadata | null {
  try {
    const view = findExifView(buffer);
    if (!view || view.byteLength < 12) return null;

    const endian = readString(view, 0, 2);
    const little = endian === "II";
    if (!little && endian !== "MM") return null;
    if (view.getUint16(2, little) !== 42) return null;

    const ifd0 = readIfd(view, 0, view.getUint32(4, little), little);
    const exifOffset = numberValue(ifd0.get(0x8769));
    const gpsOffset = numberValue(ifd0.get(0x8825));
    const exif = exifOffset ? readIfd(view, 0, exifOffset, little) : new Map<number, unknown>();
    const gps = gpsOffset ? readIfd(view, 0, gpsOffset, little) : new Map<number, unknown>();

    const metadata: ExifMetadata = {
      cameraMake: stringValue(ifd0.get(0x010f)),
      cameraModel: stringValue(ifd0.get(0x0110)),
      orientation: numberValue(ifd0.get(0x0112)),
      capturedAt: stringValue(exif.get(0x9003)) ?? stringValue(ifd0.get(0x0132)),
      focalLengthMm: numberValue(exif.get(0x920a)),
    };

    if (gps.size) {
      metadata.gps = {
        latitude: dmsToDecimal(gps.get(0x0002), gps.get(0x0001)),
        longitude: dmsToDecimal(gps.get(0x0004), gps.get(0x0003)),
        altitudeMeters: numberValue(gps.get(0x0006)),
        imageDirectionDegrees: numberValue(gps.get(0x0011)),
        dateStamp: stringValue(gps.get(0x001d)),
      };
      if (numberValue(gps.get(0x0005)) === 1 && metadata.gps.altitudeMeters !== undefined) {
        metadata.gps.altitudeMeters *= -1;
      }
    }

    return metadata;
  } catch {
    return null;
  }
}

function parseExifDate(value?: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function solarClue(metadata: ExifMetadata | null): string | null {
  const lat = metadata?.gps?.latitude;
  const lon = metadata?.gps?.longitude;
  const date = parseExifDate(metadata?.capturedAt);
  if (lat === undefined || lon === undefined || !date) return null;

  const dayStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - dayStart) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const trueSolarMinutes = ((hour * 60 + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  const hourAngle = (trueSolarMinutes / 4 < 0 ? trueSolarMinutes / 4 + 180 : trueSolarMinutes / 4 - 180) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const zenith = Math.acos(
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle)
  );
  const elevation = 90 - zenith * 180 / Math.PI;
  const azimuth = ((Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad)
  ) * 180 / Math.PI) + 180 + 360) % 360;

  const direction = metadata?.gps?.imageDirectionDegrees;
  if (direction !== undefined) {
    const diff = Math.abs(((direction - azimuth + 540) % 360) - 180);
    return `Approx sun at capture: azimuth ${azimuth.toFixed(0)} degrees, elevation ${elevation.toFixed(0)} degrees. Camera direction was ${direction.toFixed(0)} degrees, about ${diff.toFixed(0)} degrees from the sun bearing.`;
  }

  return `Approx sun at capture: azimuth ${azimuth.toFixed(0)} degrees, elevation ${elevation.toFixed(0)} degrees.`;
}

function exifSummary(metadata: ExifMetadata | null): string {
  if (!metadata) return "No usable EXIF metadata was found.";
  const lines: string[] = [];
  if (metadata.capturedAt) lines.push(`Captured at: ${metadata.capturedAt}`);
  if (metadata.cameraMake || metadata.cameraModel) lines.push(`Camera: ${[metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ")}`);
  if (metadata.focalLengthMm) lines.push(`Focal length: ${metadata.focalLengthMm.toFixed(1)}mm`);
  if (metadata.orientation) lines.push(`Orientation tag: ${metadata.orientation}`);
  if (metadata.gps?.latitude !== undefined && metadata.gps.longitude !== undefined) {
    lines.push(`GPS: ${metadata.gps.latitude.toFixed(6)}, ${metadata.gps.longitude.toFixed(6)}`);
  }
  if (metadata.gps?.altitudeMeters !== undefined) lines.push(`Altitude: ${metadata.gps.altitudeMeters.toFixed(1)}m`);
  if (metadata.gps?.imageDirectionDegrees !== undefined) lines.push(`Camera direction: ${metadata.gps.imageDirectionDegrees.toFixed(1)} degrees`);
  if (metadata.gps?.dateStamp) lines.push(`GPS date: ${metadata.gps.dateStamp}`);
  const sun = solarClue(metadata);
  if (sun) lines.push(sun);
  return lines.length ? lines.join("\n") : "No usable EXIF metadata was found.";
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const image = form.get("image");
    const metadataImage = form.get("metadataImage");
    const context = typeof form.get("context") === "string" ? String(form.get("context")).trim() : "";
    const purpose = typeof form.get("purpose") === "string" ? String(form.get("purpose")).trim() : "";
    const focusAreas = typeof form.get("focusAreas") === "string" ? String(form.get("focusAreas")).trim() : "";

    if (!(image instanceof Blob)) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const mediaType = supportedMediaType(image.type);
    if (!mediaType) {
      return NextResponse.json({ error: "Use a JPEG, PNG, GIF, or WebP image" }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Try a smaller photo." }, { status: 413 });
    }

    let metadata: ExifMetadata | null = null;
    if (metadataImage instanceof Blob && metadataImage.size <= MAX_METADATA_IMAGE_BYTES) {
      metadata = parseExif(await metadataImage.arrayBuffer());
    }
    const locationFacts = await buildLocationFacts(
      metadata?.gps?.latitude !== undefined && metadata.gps.longitude !== undefined
        ? { latitude: metadata.gps.latitude, longitude: metadata.gps.longitude }
        : null
    );

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const client = new Anthropic();

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: `You turn a user's photo and any available EXIF metadata into a concise RTHMIC creation brief.

Do not write song lyrics. Describe what is visible, infer the likely useful angle carefully, and shape it into a prompt that can become a practical Understanding-style Rthm.

If the image appears to show a place, object, meal, room, product, document, view, property, artwork, sign, or scene, identify and explain the useful details directly. The result is an answered, informative Rthm, not a checklist for the listener.

Use EXIF metadata when available. GPS, capture time, focal length, and camera direction can support concrete context such as place, aspect, sun/path clues, surrounding amenities, transport, history, or property-viewing facts.

Important: this must be about the exact photographed subject, not a generic example of its type. If the image shows a medieval wall, old stonework, a specific building, a room, or a property, identify the visible features and explain what those features mean. Anchor them to any known location/context from EXIF or the user. If the user context, reverse geocode, OpenStreetMap, Wikipedia, visible signage, or address-like clues contain a proper name, building name, street, park, landmark, district, amenity, or transport feature, put those proper nouns and facts into the prompt. If no precise location or supporting fact is known, omit that claim rather than asking the listener to research it.

Use the supplied local facts when available. Prefer named nearby places, named landmarks, dated facts, and source-backed details over vague possibility language. Never write "if there is..." or "there may be..." when a supplied local fact names the actual place. Distinguish what is known from the image/metadata/local facts from what is not known. Never invent private facts, exact history, surroundings, ownership, listing details, or landmark claims that are not visible, present in EXIF, supplied by local facts, or provided by the user.

ZERO HOMEWORK RULE: never tell the listener to look for, notice, inspect, check, verify, research, investigate, ask about, find out, consider, explore, or remember to do something. Never turn uncertainty into a question or task. Do the available analysis now: name visible architectural/material/layout/light features and explain them; state named nearby transport, amenities, landmarks, distances, and sourced history when supplied; connect those facts to the user's purpose. Unsupported details must be silently omitted.

Return strict JSON only:
{
  "prompt": "compact RTHMIC creation brief under 220 words",
  "musicStyle": "single Suno-ready music style descriptor under 190 characters, built from exact image contents plus known location/time facts, no artist names",
  "tagHints": ["3-8 lowercase tags that describe the actual subject, not broad business categories"]
}`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `User context: ${context || "No extra context provided."}
User purpose: ${purpose || "No specific purpose provided."}
Selected learning focus: ${focusAreas || "No selected focus areas."}

EXIF metadata:
${exifSummary(metadata)}

Local facts from geodata:
${locationFacts || "No geodata-based local facts were available."}

Return JSON for RTHMIC. In prompt include:
- What the photo appears to show.
- The most specific name/address/location anchor available, using proper nouns from the user context, visible signage, EXIF, reverse geocode, local facts, or map-like clues.
- Why it might matter.
- Direct findings and explanations based on the selected focus/purpose. Describe the visible evidence and explain its significance instead of telling the listener what to look for.
- Any useful metadata-derived or geodata-derived facts, clearly separated from visual observations.
- Named nearby places or famous nearby facts when supplied.
- For a property purpose, directly include supplied facts about nearby transport, amenities, aspect/light, setting, access, and visible building features. Explain tradeoffs only when grounded in those facts.
- No questions, research suggestions, viewing checklist, calls to action, or tasks for the listener.

For tagHints:
- Prefer concrete visual/place tags such as "stone wall", "architecture", "local history", "property", "sun aspect", "photograph".
- Do not use "finance" unless the image or user context is explicitly about money, tax, banking, investing, or budgets.
- Do not use "business" unless the image or user context is explicitly about a company or commercial task.

For musicStyle:
- Make the music fully automatic and specific to this photograph; do not choose from standard RTHMIC preset names.
- Build the style from visible contents, place type, named location facts, capture time, weather/light clues, historical/cultural/geographic context, and user purpose where supplied.
- Prefer concrete descriptors such as local instrumentation, tempo, texture, rhythm, vocal stance, and mood that fit this exact place or subject now.
- If location data is absent, derive the style from the visible subject and say only visually grounded things.
- Do not invent local music traditions, private facts, current businesses, or historical claims. Avoid artist names and copyrighted style references.`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Could not interpret photo" }, { status: 500 });
    }

    const parsed = parseVisionJson(textBlock.text);
    if (!parsed.prompt) {
      return NextResponse.json({ error: "Could not interpret photo" }, { status: 500 });
    }

    const seed = [
      "Developer experiment: Photograph to Rthm.",
      parsed.prompt,
      "SOURCE FACTS TO USE, NOT SUMMARISE AWAY:",
      `User context: ${context || "No extra context provided."}`,
      `User purpose: ${purpose || "No specific purpose provided."}`,
      `Selected learning focus: ${focusAreas || "No selected focus areas."}`,
      `EXIF metadata:\n${exifSummary(metadata)}`,
      `Local facts from geodata:\n${locationFacts || "No geodata-based local facts were available."}`,
      "Make the Rthm clear, specific, useful, and fully answered. Keep it anchored to the exact photographed subject and any known location/context. If a building name, street, park, district, nearby landmark, transport feature, amenity, date, distance, or coordinate appears in the source facts, use it directly in the title, state summary, and first verse where natural. State and explain visible features rather than telling the listener to look for them. Never give the listener questions, homework, research suggestions, checks, viewing tasks, or things to consider. If a fact is unavailable, omit it. Do not mention that an AI vision model described the image.",
    ].join(" ");

    const fallbackMusicStyle = [
      "Documentary photo Rthm",
      "specific visual details",
      "location-aware spoken-sung vocal",
      "measured pulse",
      "warm observational texture",
    ].join(", ");

    return NextResponse.json({
      seed,
      autoGenre: parsed.musicStyle || fallbackMusicStyle,
      tagHints: ["photograph", "visual memory", ...parsed.tagHints],
    });
  } catch (err) {
    console.error("Photo Rthm error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not interpret photo" },
      { status: 500 }
    );
  }
}
