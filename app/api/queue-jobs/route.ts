// GET /api/queue-jobs — returns queued/generating job details for the current user.
// Used by My Rthms to show placeholder "Generating…" cards.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE } from "@/app/lib/redis";
import { withRedisQueue, getUserJobIds, getJob, jobKey, removeJobFromUserList } from "@/app/lib/queueLib";

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

export async function DELETE(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ dismissed: false });

  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  return withRedisQueue(async (client) => {
    const job = await getJob(client, jobId);
    if (!job || job.userId !== uid) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (job.status !== "failed") {
      return NextResponse.json({ error: "Only failed jobs can be dismissed" }, { status: 409 });
    }

    await client.del(jobKey(jobId));
    await removeJobFromUserList(client, uid, jobId);
    return NextResponse.json({ dismissed: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
