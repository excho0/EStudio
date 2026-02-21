export type RedisPoolName =
  | "default"
  | "realtime"
  | "event-bus"
  | "socket-io"
  | "render-queue"
  | "publish-queue"
  | "caption-queue";

type RedisPoolConfig = {
  envKeys: string[];
  fallbackToDefault: boolean;
  optional: boolean;
};

const POOL_CONFIG: Record<RedisPoolName, RedisPoolConfig> = {
  default: {
    envKeys: ["REDIS_URL"],
    fallbackToDefault: false,
    optional: true,
  },
  realtime: {
    envKeys: ["REALTIME_REDIS_URL"],
    fallbackToDefault: true,
    optional: true,
  },
  "event-bus": {
    envKeys: ["EVENT_BUS_REDIS_URL"],
    fallbackToDefault: true,
    optional: true,
  },
  "socket-io": {
    envKeys: ["SOCKET_IO_REDIS_URL"],
    fallbackToDefault: true,
    optional: true,
  },
  "render-queue": {
    envKeys: ["RENDER_QUEUE_REDIS_URL"],
    fallbackToDefault: true,
    optional: false,
  },
  "publish-queue": {
    envKeys: ["PUBLISH_QUEUE_REDIS_URL"],
    fallbackToDefault: true,
    optional: false,
  },
  "caption-queue": {
    envKeys: ["CAPTION_QUEUE_REDIS_URL"],
    fallbackToDefault: true,
    optional: false,
  },
};

const readEnv = (key: string) => process.env[key]?.trim() || "";

export const resolveRedisPoolUrl = (pool: RedisPoolName): string => {
  const config = POOL_CONFIG[pool];
  for (const envKey of config.envKeys) {
    const value = readEnv(envKey);
    if (value) return value;
  }
  if (config.fallbackToDefault && pool !== "default") {
    return resolveRedisPoolUrl("default");
  }
  return "";
};

export const hasRedisPoolUrl = (pool: RedisPoolName): boolean =>
  resolveRedisPoolUrl(pool).length > 0;

export const isRedisPoolOptional = (pool: RedisPoolName): boolean =>
  POOL_CONFIG[pool].optional;
