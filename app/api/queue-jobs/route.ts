// GET /api/queue-jobs — returns queued/generating job details for the current user.
// Used by My Rthms to show placeholder "Generating…" cards.

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
  if (!process.env.REDIS_URL) return NextResponse.json({ jobs: [] });

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    const jobIds = await getUserJobIds(client, uid);
    const active = [];
    for (const jobId of jobIds) {
      const job = await getJob(client, jobId);
      if (job && (job.status === "pending" || job.status === "generating")) {
        active.push({
          jobId: job.jobId,
          title: job.title,
          pillar: job.pillar,
          status: job.status,
          createdAt: job.createdAt,
        });
      }
    }
    return NextResponse.json({ jobs: active }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    await client.disconnect();
  }
}
