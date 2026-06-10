import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { Resend } from "resend";
import { requireAdmin } from "@/app/lib/access";
import { buildBetaAccessEmailHtml, buildBetaAccessEmailText, makeBetaCode } from "@/app/lib/betaAccess";

interface AccessRequestEntry {
  email: string;
  requestedAt?: number;
  source?: string;
}

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

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ requests: [] });
  }

  try {
    const requests = await withRedis(async (client) => {
      const emails = Array.from(new Set(await client.lRange("access-requests", 0, 499)));
      const entries = await Promise.all(
        emails.map(async (email) => {
          const raw = await client.get(`access-request:${email}`);
          if (!raw) return { email } satisfies AccessRequestEntry;
          try {
            const parsed = JSON.parse(raw) as AccessRequestEntry;
            return { email: parsed.email || email, requestedAt: parsed.requestedAt, source: parsed.source };
          } catch {
            return { email } satisfies AccessRequestEntry;
          }
        })
      );
      return entries.sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0));
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("[access-requests] Could not load requests:", error);
    return NextResponse.json({ error: "Could not load access requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ error: "Redis is not configured" }, { status: 500 });
  }

  let email: string;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const normalised = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  try {
    const code = await withRedis(async (client) => {
      let newCode = makeBetaCode();
      if (await client.exists(`beta-code:${newCode}`)) newCode = makeBetaCode();

      await client
        .multi()
        .set(`beta-code:${newCode}`, JSON.stringify({ email: normalised, createdAt: Date.now(), approvedAt: Date.now() }))
        .del(`access-request:${normalised}`)
        .lRem("access-requests", 0, normalised)
        .exec();

      return newCode;
    });

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RTHMIC_FROM_EMAIL ?? "access@rthmic.app";
      await resend.emails.send({
        from: `RTHMIC <${fromEmail}>`,
        to: normalised,
        subject: "Your RTHMIC Access Code",
        html: buildBetaAccessEmailHtml(code),
        text: buildBetaAccessEmailText(code),
      });
      return NextResponse.json({ ok: true, sent: true });
    }

    return NextResponse.json({ ok: true, sent: false, code });
  } catch (error) {
    console.error("[access-requests] Could not approve request:", error);
    return NextResponse.json({ error: "Could not approve access request" }, { status: 500 });
  }
}
