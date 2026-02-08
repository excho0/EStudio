import type { RedisPoolName } from "@/lib/redis/client";
import { getRedisClient } from "@/lib/redis/client-manager";

type StoreMode = "memory" | "redis";

type SnapshotStoreOptions = {
  keyPrefix: string;
  pool?: RedisPoolName;
  modeEnvKey?: string;
};

const GLOBAL_SCOPE = "__global__";

const resolveScope = (scope?: string | null) =>
  scope && scope.trim().length > 0 ? scope : GLOBAL_SCOPE;

const resolveStoreMode = (modeEnvKey?: string): StoreMode => {
  const configured =
    modeEnvKey && process.env[modeEnvKey]
      ? process.env[modeEnvKey]?.trim().toLowerCase()
      : process.env.RENDER_PROGRESS_STORE?.trim().toLowerCase();
  if (configured === "memory") return "memory";
  if (configured === "redis") return "redis";
  if (process.env.NODE_ENV === "production" && process.env.REDIS_URL) {
    return "redis";
  }
  return "memory";
};

export const createScopedSnapshotStore = <T extends { id: string }>(
  options: SnapshotStoreOptions
) => {
  const memoryStore = new Map<string, Map<string, T>>();
  const pool = options.pool ?? "realtime";

  const memorySet = (scope: string | null | undefined, payload: T) => {
    const scoped = resolveScope(scope);
    const entries = memoryStore.get(scoped) ?? new Map<string, T>();
    entries.set(payload.id, payload);
    memoryStore.set(scoped, entries);
  };

  const memoryDelete = (scope: string | null | undefined, id: string) => {
    const scoped = resolveScope(scope);
    const entries = memoryStore.get(scoped);
    if (!entries) return;
    entries.delete(id);
    if (entries.size === 0) {
      memoryStore.delete(scoped);
    }
  };

  const memoryGetAll = (scope: string | null | undefined) => {
    const scoped = resolveScope(scope);
    const entries = memoryStore.get(scoped);
    if (!entries) return {} as Record<string, T>;
    return Object.fromEntries(entries.entries()) as Record<string, T>;
  };

  const redisKey = (scope?: string | null) => `${options.keyPrefix}:${resolveScope(scope)}`;

  const set = async (scope: string | null | undefined, payload: T) => {
    if (resolveStoreMode(options.modeEnvKey) === "memory") {
      memorySet(scope, payload);
      return;
    }
    const client = await getRedisClient(pool);
    if (!client) {
      memorySet(scope, payload);
      return;
    }
    try {
      await client.hSet(redisKey(scope), payload.id, JSON.stringify(payload));
    } catch {
      memorySet(scope, payload);
    }
  };

  const remove = async (scope: string | null | undefined, id: string) => {
    if (resolveStoreMode(options.modeEnvKey) === "memory") {
      memoryDelete(scope, id);
      return;
    }
    const client = await getRedisClient(pool);
    if (!client) {
      memoryDelete(scope, id);
      return;
    }
    try {
      await client.hDel(redisKey(scope), id);
    } catch {
      memoryDelete(scope, id);
    }
  };

  const getAll = async (scope: string | null | undefined) => {
    if (resolveStoreMode(options.modeEnvKey) === "memory") {
      return memoryGetAll(scope);
    }
    const client = await getRedisClient(pool);
    if (!client) {
      return memoryGetAll(scope);
    }
    try {
      const raw = await client.hGetAll(redisKey(scope));
      const parsed: Record<string, T> = {};
      for (const [id, value] of Object.entries(raw)) {
        try {
          parsed[id] = JSON.parse(value) as T;
        } catch {
          // ignore malformed values
        }
      }
      return parsed;
    } catch {
      return memoryGetAll(scope);
    }
  };

  return { set, remove, getAll };
};
