if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

import { z } from "zod";
import type { NotificationStatus } from "@/types";
import { upsertNotificationByKey } from "@/lib/data/notifications";
import { getContentItem } from "@/lib/data/content";
import { notificationStatusSchema } from "@/lib/data/notifications/schemas";
import {
  clearLiveNotificationSnapshot,
  type LiveNotificationSnapshotInput,
  setLiveNotificationSnapshot,
} from "@/lib/notifications/live-store";
import { sendWebPushToUserByKind } from "@/lib/push/web-push";

export type NotificationPersistPayload = LiveNotificationSnapshotInput & {
  userId?: string | null;
};

export const persistCheckpointSchema = z.object({
  at: z.number(),
  status: notificationStatusSchema,
  bucket: z.number().int().nonnegative(),
});

type PersistCheckpoint = z.infer<typeof persistCheckpointSchema>;

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
let lastTimestamp = 0;

const nextMonotonicTimestamp = () => {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
};

const hasNonEmptyTitle = (metadata?: Record<string, unknown> | null) =>
  typeof metadata?.title === "string" && metadata.title.trim().length > 0;

const withResolvedNotificationMetadata = async (
  payload: NotificationPersistPayload
): Promise<NotificationPersistPayload> => {
  if (!payload.userId) return payload;
  if (hasNonEmptyTitle(payload.metadata)) return payload;
  if (!payload.contentId) return payload;

  try {
    const item = await getContentItem(payload.userId, payload.contentId);
    const title = item?.title?.trim();
    if (!title) return payload;
    return {
      ...payload,
      metadata: {
        ...(payload.metadata ?? {}),
        title,
      },
    };
  } catch {
    return payload;
  }
};

const isTerminal = (status: NotificationStatus) =>
  status === "completed" || status === "failed" || status === "canceled";

const buildPushTitle = (payload: NotificationPersistPayload) => {
  const label =
    payload.kind === "render"
      ? "Render"
      : payload.kind === "publish"
        ? "Publish"
        : "Captions";

  if (payload.status === "completed") {
    return `${label} complete`;
  }
  if (payload.status === "failed") {
    return `${label} failed`;
  }
  if (payload.status === "canceled") {
    return `${label} canceled`;
  }
  return label;
};

const buildPushBody = (payload: NotificationPersistPayload) => {
  const title =
    typeof payload.metadata?.title === "string" ? payload.metadata.title.trim() : "";
  if (payload.status === "failed" && payload.error?.trim()) {
    return title ? `${title} · ${payload.error.trim()}` : payload.error.trim();
  }
  if (title) {
    return title;
  }
  return payload.stage?.trim() || undefined;
};

const buildPushUrl = (payload: NotificationPersistPayload) => {
  if (!payload.contentId) {
    return "/dashboard";
  }
  if (payload.kind === "render") {
    return `/renders/${payload.contentId}`;
  }
  if (payload.kind === "publish") {
    return `/publishes/${payload.contentId}`;
  }
  return `/edit/${payload.contentId}/captions`;
};

const buildPushImage = (payload: NotificationPersistPayload) => {
  if (!payload.contentId) {
    return undefined;
  }
  return `/api/content/${payload.contentId}/asset?type=thumbnail`;
};

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
          metadata: payload.metadata ?? null,
          updatedAt: payload.updatedAt,
        });
        rememberPersist(payload);
        if (isTerminal(payload.status)) {
          await clearLiveNotificationSnapshot(payload.userId, payload.key);
          await sendWebPushToUserByKind(payload.userId, payload.kind, {
            title: buildPushTitle(payload),
            body: buildPushBody(payload),
            url: buildPushUrl(payload),
            image: buildPushImage(payload),
            tag: payload.key,
            data: {
              contentId: payload.contentId,
              kind: payload.kind,
              status: payload.status,
            },
          });
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
  const normalizedPayload: NotificationPersistPayload = {
    ...payload,
    updatedAt: payload.updatedAt ?? nextMonotonicTimestamp(),
  };
  const enrichedPayload = await withResolvedNotificationMetadata(normalizedPayload);

  await setLiveNotificationSnapshot(payload.userId, {
    key: enrichedPayload.key,
    contentId: enrichedPayload.contentId,
    mode: enrichedPayload.mode,
    kind: enrichedPayload.kind,
    status: enrichedPayload.status,
    progress: enrichedPayload.progress,
    stage: enrichedPayload.stage,
    error: enrichedPayload.error,
    metadata: enrichedPayload.metadata ?? undefined,
    updatedAt: enrichedPayload.updatedAt,
  });

  if (!shouldPersistNow(enrichedPayload)) {
    return;
  }

  pending.set(
    `${enrichedPayload.userId}:${enrichedPayload.key}`,
    enrichedPayload
  );
  scheduleFlush();
};
