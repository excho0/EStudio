import IORedis from "ioredis";

const inMemoryCancelRequests = new Map<string, number>();
const CANCEL_TTL_SECONDS = 60 * 30;

const resolveRenderRedisUrl = () =>
  process.env.RENDER_QUEUE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";

const getCancelKey = (userId: string, id: string) => `render:cancel:${userId}:${id}`;

const withRedis = async <T>(
  fn: (client: IORedis, key: string) => Promise<T>,
  userId: string,
  id: string
) => {
  const redisUrl = resolveRenderRedisUrl();
  if (!redisUrl) {
    return null;
  }
  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  try {
    await client.connect();
    return await fn(client, getCancelKey(userId, id));
  } catch {
    return null;
  } finally {
    await client.quit().catch(() => null);
  }
};

export const requestRenderCancellation = async (userId: string, id: string) => {
  const expiresAt = Date.now() + CANCEL_TTL_SECONDS * 1000;
  inMemoryCancelRequests.set(getCancelKey(userId, id), expiresAt);
  await withRedis(
    (client, key) => client.set(key, "1", "EX", CANCEL_TTL_SECONDS),
    userId,
    id
  );
};

export const clearRenderCancellation = async (userId: string, id: string) => {
  inMemoryCancelRequests.delete(getCancelKey(userId, id));
  await withRedis((client, key) => client.del(key), userId, id);
};

export const isRenderCancellationRequested = async (userId: string, id: string) => {
  const key = getCancelKey(userId, id);
  const inMemoryExpiry = inMemoryCancelRequests.get(key);
  if (typeof inMemoryExpiry === "number") {
    if (inMemoryExpiry > Date.now()) {
      return true;
    }
    inMemoryCancelRequests.delete(key);
  }
  const redisValue = await withRedis((client, redisKey) => client.get(redisKey), userId, id);
  return redisValue === "1";
};

