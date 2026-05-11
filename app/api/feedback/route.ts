// /api/feedback
// POST — save a feedback entry to Redis and email it to doug@rthmic.app
// GET  — developer-only: retrieve all entries, requires ?key=ADMIN_KEY

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { Resend } from "resend";

const REDIS_KEY = "feedback:entries";
const MAX_ENTRIES = 500;
const FEEDBACK_TO = "doug@rthmic.app";

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

  // ── Redis ─────────────────────────────────────────────────────────────────
  if (!process.env.REDIS_URL) {
    console.log("Feedback (no Redis):", entry);
  } else {
    const client = await getClient();
    try {
      await client.lPush(REDIS_KEY, JSON.stringify(entry));
      await client.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1);
    } finally {
      await client.disconnect();
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const date = new Date(entry.submittedAt).toLocaleString("en-GB", {
        timeZone: "UTC", dateStyle: "full", timeStyle: "short",
      });
      await resend.emails.send({
        from: process.env.RTHMIC_FROM_EMAIL ?? "RTHMIC <noreply@rthmic.app>",
        to: FEEDBACK_TO,
        subject: `RTHMIC Feedback — ${date}`,
        text: [
          `User: ${uid}`,
          `Submitted: ${date} UTC`,
          ``,
          entry.transcript,
        ].join("\n"),
        html: `
          <p style="color:#888;font-size:12px;margin:0 0 16px">User: ${uid} &nbsp;·&nbsp; ${date} UTC</p>
          <p style="font-size:16px;line-height:1.6;white-space:pre-wrap">${entry.transcript.replace(/</g, "&lt;")}</p>
        `,
      });
    } catch (err) {
      // Email failure is non-fatal — entry is already in Redis
      console.error("Feedback email failed:", err);
    }
  } else {
    console.log("Feedback email skipped (no RESEND_API_KEY):", entry.transcript.slice(0, 100));
  }

  return NextResponse.json({ ok: true });
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
