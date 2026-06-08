// GET /api/admin/debug — shows live queue + library state for diagnosis.
// Protected by the same session token. Returns JSON readable in the browser.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/access";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";
import { USERS_KEY, userQueueKey, jobKey } from "@/app/lib/queueLib";
import type { QueueJob } from "@/app/lib/queueLib";
import { libraryKey, readSavedRhythms } from "@/app/lib/rhythmStorage";

export const maxDuration = 20;

const SUNO_BASE = "https://api.sunoapi.org/api/v1";
const APP_URL = "https://rthmic.app";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = req.cookies.get("rthmic_uid")?.value ?? "";

  if (!REDIS_AVAILABLE) return NextResponse.json({ error: "No REDIS_URL" }, { status: 500 });

  return withRedis(async (client) => {
    // 1. Queue state
    const allUsers = await client.sMembers(USERS_KEY);
    const userJobIds: string[] = await client.lRange(userQueueKey(uid), 0, -1);
    const jobs: (QueueJob & { age_min: number; pollResult?: unknown })[] = [];

    for (const jobId of userJobIds) {
      const raw = await client.get(jobKey(jobId));
      if (!raw) continue;
      const job = JSON.parse(raw) as QueueJob;
      const entry = { ...job, age_min: Math.round((Date.now() - job.createdAt) / 60000), pollResult: undefined as unknown };

      // Live-poll any generating jobs
      if (job.status === "generating" && job.sunoTaskId) {
        try {
          const pollRes = await fetch(
            `${APP_URL}/api/poll-generation?taskId=${encodeURIComponent(job.sunoTaskId)}&t=${Date.now()}`,
            { cache: "no-store" }
          );
          entry.pollResult = pollRes.ok ? await pollRes.json() : { httpError: pollRes.status };
        } catch (err) {
          entry.pollResult = { fetchError: String(err) };
        }
      }

      // Also try hitting Suno directly for generating jobs
      if (job.status === "generating" && job.sunoTaskId) {
        try {
          const sunoRes = await fetch(
            `${SUNO_BASE}/generate/record-info?taskId=${encodeURIComponent(job.sunoTaskId)}`,
            { headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` } }
          );
          (entry as Record<string, unknown>).sunoRaw = sunoRes.ok
            ? JSON.stringify(await sunoRes.json()).slice(0, 1000)
            : { httpError: sunoRes.status, body: await sunoRes.text().then(t => t.slice(0, 200)) };
        } catch (err) {
          (entry as Record<string, unknown>).sunoRaw = { fetchError: String(err) };
        }
      }

      jobs.push(entry);
    }

    // 2. Library — first 5 items
    const library = await readSavedRhythms(client, libraryKey(uid));
    const recentLib = library.slice(0, 5).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      pillar: r.pillar,
      hasAudio: !!r.audioUrl,
      savedAt: new Date(r.savedAt).toISOString(),
    }));

    // 3. Suno API key check (masked)
    const sunoKey = process.env.SUNO_API_KEY;
    const keyInfo = sunoKey
      ? `set (${sunoKey.slice(0, 4)}...${sunoKey.slice(-4)}, len=${sunoKey.length})`
      : "NOT SET";

    return NextResponse.json(
      {
        uid: uid.slice(0, 8) + "…",
        timestamp: new Date().toISOString(),
        sunoApiKey: keyInfo,
        queueUsersCount: allUsers.length,
        yourJobIds: userJobIds,
        jobs,
        recentLibrary: recentLib,
        libraryTotal: library.length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}
