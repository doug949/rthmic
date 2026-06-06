// Shared Redis queue helpers used by /api/queue-generation, /api/process-queue, /api/queue-status

import type { StyleChoice } from "@/app/services/llmService";
import type { PillarType, StateSummary } from "@/app/types/pipeline";
import { withRedis, type RedisClient } from "@/app/lib/redis";

export interface QueueJob {
  jobId: string;
  userId: string;
  status: "pending" | "writing" | "generating" | "done" | "failed";
  failureReason?: string;
  pillar: PillarType;
  title: string;
  style: StyleChoice;
  lyrics: string;
  transcript?: string;
  stateSummary?: StateSummary;
  genre: string;
  note?: string;
  experiment?: string;
  tagHints?: string[];
  menuSlug?: string;
  rthmixId?: string;
  rthmixTitle?: string;
  rthmixType?: "memory" | "progression";
  rthmixTrackNumber?: string;
  rthmixTrackRole?: "ground-zero" | "memory-hook" | "unlock" | "bonus";
  rthmixUnlock?: string;
  rthmixAlbumArtPrompt?: string;
  sunoTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

const JOB_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export function jobKey(jobId: string) { return `queue:job:${jobId}`; }
export function userQueueKey(userId: string) { return `queue:user:${userId}`; }
export const USERS_KEY = "queue:users";

export async function withRedisQueue<T>(
  fn: (client: RedisClient) => Promise<T>
): Promise<T> {
  return withRedis(fn);
}

export function taskIdKey(sunoTaskId: string) { return `queue:taskid:${sunoTaskId}`; }

export async function pushJob(job: QueueJob): Promise<void> {
  await withRedisQueue(async (client) => {
    const pipe = client.multi();
    pipe.set(jobKey(job.jobId), JSON.stringify(job), { EX: JOB_TTL_SECONDS });
    pipe.rPush(userQueueKey(job.userId), job.jobId);
    pipe.expire(userQueueKey(job.userId), JOB_TTL_SECONDS);
    pipe.sAdd(USERS_KEY, job.userId);
    await pipe.exec();
  });
}

export async function indexTaskId(
  client: RedisClient,
  sunoTaskId: string,
  jobId: string
): Promise<void> {
  await client.set(taskIdKey(sunoTaskId), jobId, { EX: JOB_TTL_SECONDS });
}

export async function jobIdForTaskId(
  client: RedisClient,
  sunoTaskId: string
): Promise<string | null> {
  return client.get(taskIdKey(sunoTaskId));
}

export async function getJob(
  client: RedisClient,
  jobId: string
): Promise<QueueJob | null> {
  const raw = await client.get(jobKey(jobId));
  return raw ? (JSON.parse(raw) as QueueJob) : null;
}

export async function updateJob(
  client: RedisClient,
  job: QueueJob
): Promise<void> {
  job.updatedAt = Date.now();
  await client.set(jobKey(job.jobId), JSON.stringify(job), { EX: JOB_TTL_SECONDS });
}

export async function getUserJobIds(
  client: RedisClient,
  userId: string
): Promise<string[]> {
  return client.lRange(userQueueKey(userId), 0, -1);
}

export async function removeJobFromUserList(
  client: RedisClient,
  userId: string,
  jobId: string
): Promise<void> {
  await client.lRem(userQueueKey(userId), 0, jobId);
}

export async function getQueueStats(
  client: RedisClient,
  userId: string
): Promise<{ pending: number; generating: number }> {
  const jobIds = await getUserJobIds(client, userId);
  let pending = 0;
  let generating = 0;
  for (const jobId of jobIds) {
    const job = await getJob(client, jobId);
    if (!job) continue;
    if (job.status === "pending" || job.status === "writing") pending++;
    if (job.status === "generating") generating++;
  }
  return { pending, generating };
}
