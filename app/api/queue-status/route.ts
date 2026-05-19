// GET /api/queue-status — returns active job counts for the current user.
// Polled by the QueuePill component every 15s to show a badge.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { getUserJobIds, getJob } from "@/app/lib/queueLib";

export const maxDuration = 10;

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

export async function GET(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ active: 0 });

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    const jobIds = await getUserJobIds(client, uid);
    let active = 0;
    for (const jobId of jobIds) {
      const job = await getJob(client, jobId);
      if (job && (job.status === "pending" || job.status === "generating")) active++;
    }
    return NextResponse.json({ active }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    await client.disconnect();
  }
}
