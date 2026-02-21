import { createClient } from "redis";
import { resolveRedisPoolUrl, type RedisPoolName } from "./pools";
export type { RedisPoolName } from "./pools";

type RedisClient = ReturnType<typeof createClient>;

const redisClients = new Map<RedisPoolName, Promise<RedisClient | null>>();

export const getRedisClient = async (
  pool: RedisPoolName = "default"
): Promise<RedisClient | null> => {
  const url = resolveRedisPoolUrl(pool);
  if (!url) return null;

  const existing = redisClients.get(pool);
  if (existing) return existing;

  const next = (async () => {
    const client = createClient({
      url,
      socket: { reconnectStrategy: (retries) => Math.min(1000 * retries, 10_000) },
    });
    client.on("error", () => {
      // Consumers fall back to memory store.
    });
    try {
      await client.connect();
      return client;
    } catch {
      try {
        await client.quit();
      } catch {
        // ignore
      }
      return null;
    }
  })();

  redisClients.set(pool, next);
  return next;
};
