// /api/feedback
// POST — save a feedback entry (transcription + metadata) to Redis
// GET  — developer-only: retrieve all entries, requires ?key=ADMIN_KEY

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

const REDIS_KEY = "feedback:entries";
const MAX_ENTRIES = 500;

async function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export interface FeedbackEntry {
  id: string;
  uid: string;
  transcript: string;
  submittedAt: number; // unix ms
}

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("rthmic_uid")?.value ?? "anonymous";
  const { transcript } = await req.json();

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  const entry: FeedbackEntry = {
    id: crypto.randomUUID(),
    uid,
    transcript: transcript.trim().slice(0, 4000),
    submittedAt: Date.now(),
  };

  if (!process.env.REDIS_URL) {
    // Dev fallback — just log it
    console.log("Feedback (no Redis):", entry);
    return NextResponse.json({ ok: true });
  }

  const client = await getClient();
  try {
    await client.lPush(REDIS_KEY, JSON.stringify(entry));
    await client.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1); // cap at 500
    return NextResponse.json({ ok: true });
  } finally {
    await client.disconnect();
  }
}

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.nextUrl.searchParams.get("key");

  if (!adminKey || provided !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ entries: [] });
  }

  const client = await getClient();
  try {
    const raw = await client.lRange(REDIS_KEY, 0, -1);
    const entries: FeedbackEntry[] = raw.map((r) => JSON.parse(r));
    return NextResponse.json({ entries });
  } finally {
    await client.disconnect();
  }
}
