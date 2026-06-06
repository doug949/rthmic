// GET /api/queue-status — returns active job counts for the current user.
// Polled by the QueuePill component every 15s to show a badge.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE } from "@/app/lib/redis";
import { withRedisQueue, getUserJobIds, getJob } from "@/app/lib/queueLib";

export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ active: 0 });

  return withRedisQueue(async (client) => {
    const jobIds = await getUserJobIds(client, uid);
    let active = 0;
    for (const jobId of jobIds) {
      const job = await getJob(client, jobId);
      if (job && (job.status === "pending" || job.status === "writing" || job.status === "generating")) active++;
    }
    return NextResponse.json({ active }, { headers: { "Cache-Control": "no-store" } });
  });
}
