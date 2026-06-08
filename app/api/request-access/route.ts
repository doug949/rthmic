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

// ─── Code generator ────────────────────────────────────────────────────────────

/** Generates a human-readable beta code like `rthm-a3b7x2k9` */
function makeBetaCode(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars
  let suffix = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (const b of arr) suffix += chars[b % chars.length];
  return `rthm-${suffix}`;
}

// ─── Email builder ─────────────────────────────────────────────────────────────

function buildEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your RTHMIC Access Code</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

          <!-- Wordmark -->
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.4em;text-transform:uppercase;color:#c9a55a;font-weight:300;">RTHMIC</p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;border-bottom:1px solid rgba(201,165,90,0.15);">
              <h1 style="margin:0;font-size:22px;font-weight:300;color:#ffffff;line-height:1.4;letter-spacing:0.01em;">
                Your access code is ready.
              </h1>
            </td>
          </tr>

          <!-- Code block -->
          <tr>
            <td style="padding:32px 0 24px;">
              <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(255,255,255,0.4);">Your code</p>
              <div style="background:rgba(201,165,90,0.08);border:1px solid rgba(201,165,90,0.35);border-radius:12px;padding:20px 24px;display:inline-block;width:100%;box-sizing:border-box;">
                <p style="margin:0;font-size:22px;font-family:monospace;letter-spacing:0.12em;color:#c9a55a;font-weight:400;">${code}</p>
              </div>
            </td>
          </tr>

          <!-- Instructions -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
                Open RTHMIC and enter this code when prompted. It works on any device.
              </p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
                This code is yours to keep — it won't expire while you're using RTHMIC.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding-bottom:40px;">
              <a href="https://rthmic.app/login"
                style="display:block;text-align:center;padding:16px 24px;border-radius:12px;background:rgba(201,165,90,0.1);border:1px solid rgba(201,165,90,0.4);color:#c9a55a;font-size:14px;font-weight:600;letter-spacing:0.05em;text-decoration:none;">
                Open RTHMIC →
              </a>
            </td>
          </tr>

          <!-- What is RTHMIC -->
          <tr>
            <td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:32px;padding-bottom:8px;">
              <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:rgba(255,255,255,0.3);">What is RTHMIC</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.7;">
                RTHMIC generates complete songs built for exactly what you're facing right now.
                You speak your state. It builds a Rthm — a musical tool that installs a mindset,
                breaks inertia, or helps you move through the moment.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:40px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);line-height:1.6;">
                You received this because someone shared a Rthm with you and you requested beta access.<br />
                RTHMIC · rthmic.app
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function buildEmailText(code: string): string {
  return `
RTHMIC — Your Access Code

Your code: ${code}

Open RTHMIC and enter this code when prompted. It works on any device.
This code is yours to keep.

Open RTHMIC: https://rthmic.app/login

---
What is RTHMIC?
RTHMIC generates complete songs built for exactly what you're facing right now.
You speak your state. It builds a Rthm — a musical tool that installs a mindset,
breaks inertia, or helps you move through the moment.

---
You received this because someone shared a Rthm with you and you requested beta access.
RTHMIC · rthmic.app
  `.trim();
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let email: string;
  try {
    ({ email } = await request.json());
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
        html: buildEmailHtml(code),
        text: buildEmailText(code),
      });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[request-access] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
