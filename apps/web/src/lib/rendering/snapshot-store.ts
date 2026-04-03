import type { RedisPoolName } from "@/lib/redis/client";
import { getRedisClient } from "@/lib/redis/client-manager";
import { hasRedisPoolUrl } from "@/lib/redis/pools";

type StoreMode = "memory" | "redis";
type StoreModeResolution = {
  mode: StoreMode;
  explicit: boolean;
};

type SnapshotStoreOptions = {
  keyPrefix: string;
  pool?: RedisPoolName;
  modeEnvKey?: string;
};

const GLOBAL_SCOPE = "__global__";

const resolveScope = (scope?: string | null) =>
  scope && scope.trim().length > 0 ? scope : GLOBAL_SCOPE;

const resolveStoreMode = (
  pool: RedisPoolName,
  modeEnvKey?: string
): StoreModeResolution => {
  const configured =
    modeEnvKey && process.env[modeEnvKey]
      ? process.env[modeEnvKey]?.trim().toLowerCase()
      : process.env.RENDER_PROGRESS_STORE?.trim().toLowerCase();
  if (configured === "memory") return { mode: "memory", explicit: true };
  if (configured === "redis") return { mode: "redis", explicit: true };
  if (hasRedisPoolUrl(pool)) {
    return { mode: "redis", explicit: false };
  }
  return { mode: "memory", explicit: false };
};

export const createScopedSnapshotStore = <T extends { id: string; key?: string }>(
  options: SnapshotStoreOptions
) => {
  const memoryStore = new Map<string, Map<string, T>>();
  const pool = options.pool ?? "realtime";
  const resolveEntryKey = (payload: T) =>
    payload.key && payload.key.trim().length > 0 ? payload.key : payload.id;

  const memorySet = (scope: string | null | undefined, payload: T) => {
    const scoped = resolveScope(scope);
    const entries = memoryStore.get(scoped) ?? new Map<string, T>();
    entries.set(resolveEntryKey(payload), payload);
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
    const resolved = resolveStoreMode(pool, options.modeEnvKey);
    if (resolved.mode === "memory") {
      memorySet(scope, payload);
      return;
    }
    const client = await getRedisClient(pool);
    if (!client) {
      if (resolved.explicit) {
        throw new Error(
          `Snapshot store "${options.keyPrefix}" is configured for redis but pool "${pool}" is unavailable.`
        );
      }
      memorySet(scope, payload);
      return;
    }
    try {
      await client.hSet(redisKey(scope), resolveEntryKey(payload), JSON.stringify(payload));
    } catch {
      memorySet(scope, payload);
    }
  };

  const remove = async (scope: string | null | undefined, id: string) => {
    const resolved = resolveStoreMode(pool, options.modeEnvKey);
    if (resolved.mode === "memory") {
      memoryDelete(scope, id);
      return;
    }
    const client = await getRedisClient(pool);
    if (!client) {
      if (resolved.explicit) {
        throw new Error(
          `Snapshot store "${options.keyPrefix}" is configured for redis but pool "${pool}" is unavailable.`
        );
      }
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
    const resolved = resolveStoreMode(pool, options.modeEnvKey);
    if (resolved.mode === "memory") {
      return memoryGetAll(scope);
    }
    const client = await getRedisClient(pool);
    if (!client) {
      if (resolved.explicit) {
        throw new Error(
          `Snapshot store "${options.keyPrefix}" is configured for redis but pool "${pool}" is unavailable.`
        );
      }
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
