import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { requireAdmin } from "@/app/lib/access";

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
