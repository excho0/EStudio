import { createClient } from "redis";

export type RedisPoolName = "default" | "realtime" | "event-bus";
type RedisClient = ReturnType<typeof createClient>;

const redisClients = new Map<RedisPoolName, Promise<RedisClient | null>>();

const resolveRedisUrl = (pool: RedisPoolName) => {
  if (pool === "realtime") {
    return process.env.REALTIME_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";
  }
  if (pool === "event-bus") {
    return process.env.EVENT_BUS_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";
  }
  return process.env.REDIS_URL?.trim() || "";
};

export const getRedisClient = async (
  pool: RedisPoolName = "default"
): Promise<RedisClient | null> => {
  const url = resolveRedisUrl(pool);
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
