// POST /api/clear-queue — removes all pending/generating jobs for the authenticated user.
// Done jobs are left in the library; only queue state is cleared.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE } from "@/app/lib/redis";
import { withRedisQueue, getUserJobIds, getJob, jobKey, userQueueKey, USERS_KEY } from "@/app/lib/queueLib";

export async function POST(req: NextRequest) {
  const uid = requireUserId(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ cleared: 0 });

  let cleared = 0;

  await withRedisQueue(async (client) => {
    const jobIds = await getUserJobIds(client, uid);
    for (const jobId of jobIds) {
      const job = await getJob(client, jobId);
      if (!job || job.status === "done") continue; // leave completed jobs alone
      await client.del(jobKey(jobId));
      cleared++;
    }
    await client.del(userQueueKey(uid));
    await client.sRem(USERS_KEY, uid);
  });

  return NextResponse.json({ cleared });
}
