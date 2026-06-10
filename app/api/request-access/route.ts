// /api/request-access — RTHMIC Beta Access Request
//
// POST — intake an email and store a pending beta access request for admin approval.
//   Body: { firstName: string, email: string, referralSource?: string, website?: string }
//   Returns: { ok: true } | { error: string }
//
// Redis schema:
//   `beta-req:{email}`       → { sentAt }           — TTL 10 min (rate-limit / dedup)
//   `access-request:{email}` → { email, firstName, referralSource, requestedAt, source } — persistent approval queue
//   `access-requests`        → newest-first list of requested emails
//
// Required env vars:
//   REDIS_URL           — Redis connection string

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

const TEN_MIN_SEC     = 10 * 60;

const REDIS_AVAILABLE  = !!process.env.REDIS_URL;

// ─── Redis helper ──────────────────────────────────────────────────────────────

async function withRedis<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let firstName: string;
  let email: string;
  let referralSource: string | undefined;
  let website: string | undefined;
  let betaAgreementAccepted: boolean;
  try {
    ({ firstName, email, referralSource, website, betaAgreementAccepted } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Basic validation
  if (website && typeof website === "string" && website.trim()) {
    return NextResponse.json({ ok: true });
  }
  const cleanFirstName = typeof firstName === "string" ? firstName.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!cleanFirstName) {
    return NextResponse.json({ error: "First name required" }, { status: 400 });
  }
  const cleanReferralSource = typeof referralSource === "string"
    ? referralSource.trim().replace(/\s+/g, " ").slice(0, 240)
    : "";
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (betaAgreementAccepted !== true) {
    return NextResponse.json({ error: "Private beta agreement required" }, { status: 412 });
  }

  if (!REDIS_AVAILABLE) {
    console.log(`[request-access] Redis unavailable — request from ${normalised}`);
    return NextResponse.json({ ok: true });
  }

  try {
    await withRedis(async (client) => {
      const reqKey = `beta-req:${normalised}`;
      if (await client.get(reqKey)) return;

      const entry = JSON.stringify({ email: normalised, firstName: cleanFirstName, referralSource: cleanReferralSource, requestedAt: Date.now(), source: "login" });
      await client
        .multi()
        .set(`access-request:${normalised}`, entry)
        .lPush("access-requests", normalised)
        .lTrim("access-requests", 0, 499)
        .set(reqKey, "1", { EX: TEN_MIN_SEC })
        .exec();
    });

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[request-access] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
