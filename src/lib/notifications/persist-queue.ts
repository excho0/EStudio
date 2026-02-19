import "server-only";

import type { NotificationKind, NotificationStatus } from "@/types";
import { upsertNotificationByKey } from "@/lib/data/notifications";
import {
  clearLiveNotificationSnapshot,
  setLiveNotificationSnapshot,
} from "@/lib/notifications/live-store";

type NotificationPersistPayload = {
  userId?: string | null;
  key: string;
  contentId: string;
  mode?: string;
  kind: NotificationKind;
  status: NotificationStatus;
  progress?: number;
  stage?: string;
  error?: string;
};

type PersistCheckpoint = {
  at: number;
  status: NotificationStatus;
  bucket: number;
};

const pending = new Map<string, NotificationPersistPayload>();
const checkpoints = new Map<string, PersistCheckpoint>();
let flushTimer: NodeJS.Timeout | null = null;

const FLUSH_MS = Math.max(
  200,
  Number.parseInt(process.env.NOTIFICATIONS_PERSIST_FLUSH_MS ?? "1000", 10) || 1000
);
const THROTTLE_MS = Math.max(
  250,
  Number.parseInt(process.env.NOTIFICATIONS_PERSIST_THROTTLE_MS ?? "3000", 10) || 3000
);
const PROGRESS_STEP = Math.min(
  0.25,
  Math.max(
    0.01,
    Number.parseFloat(process.env.NOTIFICATIONS_PERSIST_PROGRESS_STEP ?? "0.05") || 0.05
  )
);
const BATCH_SIZE = Math.max(
  10,
  Number.parseInt(process.env.NOTIFICATIONS_PERSIST_BATCH_SIZE ?? "200", 10) || 200
);

const isTerminal = (status: NotificationStatus) =>
  status === "completed" || status === "failed";

const normalizeProgress = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
};

const shouldPersistNow = (payload: NotificationPersistPayload) => {
  if (isTerminal(payload.status)) return true;
  const now = Date.now();
  const checkpoint = checkpoints.get(payload.key);
  if (!checkpoint) return true;
  if (payload.status !== checkpoint.status) return true;
  const nextBucket = Math.floor(normalizeProgress(payload.progress) / PROGRESS_STEP);
  if (nextBucket > checkpoint.bucket) return true;
  return now - checkpoint.at >= THROTTLE_MS;
};

const rememberPersist = (payload: NotificationPersistPayload) => {
  checkpoints.set(payload.key, {
    at: Date.now(),
    status: payload.status,
    bucket: Math.floor(normalizeProgress(payload.progress) / PROGRESS_STEP),
  });
};

const flushBatch = async (entries: NotificationPersistPayload[]) => {
  await Promise.all(
    entries.map(async (payload) => {
      if (!payload.userId) return;
      try {
        await upsertNotificationByKey({
          userId: payload.userId,
          key: payload.key,
          contentId: payload.contentId,
          mode: payload.mode,
          kind: payload.kind,
          status: payload.status,
          progress: payload.progress,
          stage: payload.stage,
          error: payload.error,
        });
        rememberPersist(payload);
        if (isTerminal(payload.status)) {
          await clearLiveNotificationSnapshot(payload.userId, payload.key);
        }
      } catch {
        pending.set(`${payload.userId}:${payload.key}`, payload);
      }
    })
  );
};

const flushPending = async () => {
  if (pending.size === 0) return;
  const entries = Array.from(pending.entries());
  pending.clear();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE).map(([, payload]) => payload);
    await flushBatch(chunk);
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, FLUSH_MS);
};

export const enqueueNotificationPersist = async (payload: NotificationPersistPayload) => {
  if (!payload.userId) return;

  await setLiveNotificationSnapshot(payload.userId, {
    key: payload.key,
    contentId: payload.contentId,
    mode: payload.mode,
    kind: payload.kind,
    status: payload.status,
    progress: payload.progress,
    stage: payload.stage,
    error: payload.error,
  });

  if (!shouldPersistNow(payload)) {
    return;
  }

  pending.set(`${payload.userId}:${payload.key}`, payload);
  scheduleFlush();
};
