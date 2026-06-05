// GET /api/queue-jobs — returns queued/generating job details for the current user.
// Used by My Rthms to show placeholder "Generating…" cards.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE } from "@/app/lib/redis";
import { withRedisQueue, getUserJobIds, getJob } from "@/app/lib/queueLib";

export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ jobs: [] });

  return withRedisQueue(async (client) => {
    const jobIds = await getUserJobIds(client, uid);
    const active = [];
    for (const jobId of jobIds) {
      const job = await getJob(client, jobId);
      if (job && (job.status === "pending" || job.status === "generating" || job.status === "failed")) {
        active.push({
          jobId: job.jobId,
          title: job.title,
          pillar: job.pillar,
          status: job.status,
          failureReason: job.failureReason,
          createdAt: job.createdAt,
        });
      }
    }
    return NextResponse.json({ jobs: active }, { headers: { "Cache-Control": "no-store" } });
  });
}
