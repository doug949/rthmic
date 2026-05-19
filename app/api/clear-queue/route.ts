// POST /api/clear-queue — removes all pending/generating jobs for the authenticated user.
// Done jobs are left in the library; only queue state is cleared.

import { NextRequest, NextResponse } from "next/server";
import { withRedisQueue, getUserJobIds, getJob, jobKey, userQueueKey, USERS_KEY } from "@/app/lib/queueLib";

function requireAuth(req: NextRequest): string | null {
  const session = req.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return req.cookies.get("rthmic_uid")?.value ?? null;
}

export async function POST(req: NextRequest) {
  const uid = requireAuth(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ cleared: 0 });

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
