// /api/request-access — RTHMIC Beta Access Request
//
// POST — intake an email, generate a unique beta code, store in Redis, send via Resend.
//   Body: { email: string }
//   Returns: { ok: true } | { error: string }
//
// Redis schema:
//   `beta-code:{code}`       → { email, createdAt } — persistent beta access code
//   `beta-req:{email}`       → { sentAt }           — TTL 10 min (rate-limit / dedup)
//   `access-request:{email}` → { email, requestedAt, source } — persistent waitlist fallback
//   `access-requests`        → newest-first list of requested emails
//
// Required env vars:
//   REDIS_URL           — Redis connection string
//   RESEND_API_KEY      — Resend API key
//   RTHMIC_FROM_EMAIL   — Sender address (e.g. "access@rthmic.app")

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { Resend } from "resend";
import { buildBetaAccessEmailHtml, buildBetaAccessEmailText, makeBetaCode } from "@/app/lib/betaAccess";

const TEN_MIN_SEC     = 10 * 60;

const REDIS_AVAILABLE  = !!process.env.REDIS_URL;
const RESEND_AVAILABLE = !!process.env.RESEND_API_KEY;

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
  let email: string;
  let betaAgreementAccepted: boolean;
  try {
    ({ email, betaAgreementAccepted } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Basic validation
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

  // If email delivery is not configured, keep a waitlist request instead of
  // pretending a code was sent. The UI intentionally shows a neutral message.
  if (!RESEND_AVAILABLE) {
    try {
      await withRedis(async (client) => {
        const reqKey = `beta-req:${normalised}`;
        if (await client.get(reqKey)) return;
        const entry = JSON.stringify({ email: normalised, requestedAt: Date.now(), source: "login" });
        await client
          .multi()
          .set(`access-request:${normalised}`, entry)
          .lPush("access-requests", normalised)
          .lTrim("access-requests", 0, 499)
          .set(reqKey, "1", { EX: TEN_MIN_SEC })
          .exec();
      });
    } catch (err) {
      console.error("[request-access] Waitlist error:", err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const code = await withRedis(async (client) => {
      // Rate-limit: one email per 10 minutes per address
      const reqKey = `beta-req:${normalised}`;
      const existing = await client.get(reqKey);
      if (existing) {
        // Already sent recently — silently succeed to prevent enumeration
        return null;
      }

      // Generate a unique code (retry on collision — extremely unlikely)
      let newCode = makeBetaCode();
      if (await client.exists(`beta-code:${newCode}`)) newCode = makeBetaCode();

      // Store the code permanently. Revoke manually by deleting beta-code:{code}.
      await client.set(
        `beta-code:${newCode}`,
        JSON.stringify({ email: normalised, createdAt: Date.now() })
      );

      // Rate limit marker (10 min)
      await client.set(reqKey, "1", { EX: TEN_MIN_SEC });

      return newCode;
    });

    // Whether we generated a fresh code or hit the rate limit, send ok to the UI
    // (prevents email enumeration — user always sees the same confirmation)
    if (code) {
      // Send email
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RTHMIC_FROM_EMAIL ?? "access@rthmic.app";

      await resend.emails.send({
        from: `RTHMIC <${fromEmail}>`,
        to: normalised,
        subject: "Your RTHMIC Access Code",
        html: buildBetaAccessEmailHtml(code),
        text: buildBetaAccessEmailText(code),
      });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[request-access] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
