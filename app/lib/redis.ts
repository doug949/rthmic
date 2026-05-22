import { createClient } from "redis";

export type RedisClient = ReturnType<typeof createClient>;

export const REDIS_AVAILABLE = !!process.env.REDIS_URL;

export async function withRedis<T>(
  fn: (client: RedisClient) => Promise<T>
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}
