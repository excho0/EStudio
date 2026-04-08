"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { useCaptionProgress, usePublishProgress } from "@/hooks/use-progress";
import {
  getCurrentPushSubscription,
  isWebPushSupported,
  requestNotificationPermission,
  setNotificationEnabled,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from "@/lib/notifications";
import { sdk } from "@/lib/sdk";
import type { UserNotificationPreferencesUpdateRequest } from "@/lib/sdk/domains/user-preferences";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";
import type {
  AppEventMap,
  NotificationItem,
  NotificationKind,
  NotificationStatus,
} from "@/types";

export type NotificationPreferences = {
  push: {
    enabled: boolean;
    groups: {
      content: {
        enabled: boolean;
        items: Record<string, { enabled: boolean }>;
      };
    };
  };
};

export type NotificationPreferencesPatch = {
  push?: {
    enabled?: boolean;
    groups?: {
      content?: {
        enabled?: boolean;
        items?: Record<string, { enabled: boolean }>;
      };
    };
  };
};

type ActivityHydratedItem = Pick<
  NotificationItem,
  | "key"
  | "contentId"
  | "mode"
  | "kind"
  | "status"
  | "progress"
  | "stage"
  | "error"
  | "metadata"
  | "updatedAt"
> & {
  jobId?: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
};

export type ActivityJob = Omit<ActivityHydratedItem, "contentId"> & {
  id: string;
};

const notificationLeafKeys = ["render", "publish", "caption"] as const;

const defaultPreferences: NotificationPreferences = {
  push: {
    enabled: true,
    groups: {
      content: {
        enabled: true,
        items: Object.fromEntries(
          notificationLeafKeys.map((key) => [key, { enabled: true }])
        ) as Record<(typeof notificationLeafKeys)[number], { enabled: boolean }>,
      },
    },
  },
};

const mergePreferences = (
  current: NotificationPreferences,
  patch: NotificationPreferencesPatch
): NotificationPreferences => ({
  push: {
    enabled: patch.push?.enabled ?? current.push.enabled,
    groups: {
      ...current.push.groups,
      content: {
        enabled:
          patch.push?.groups?.content?.enabled ?? current.push.groups.content.enabled,
        items: {
          ...current.push.groups.content.items,
          ...(patch.push?.groups?.content?.items ?? {}),
        },
      },
    },
  },
});

export const normalizePreferences = (
  patch?: NotificationPreferencesPatch | null
): NotificationPreferences => mergePreferences(defaultPreferences, patch ?? {});

export const useNotificationPreferences = () => {
  const queryClient = useQueryClient();
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const [subscription, response] = await Promise.all([
        getCurrentPushSubscription().catch(() => null),
        sdk.userPreferences.notifications().catch(() => null),
      ]);

      const subscribed = Boolean(subscription);
      setDeviceSubscribed(subscribed);
      setNotificationEnabled(subscribed);

      return normalizePreferences(
        (response?.preferences as NotificationPreferencesPatch | undefined) ?? null
      );
    },
  });

  const preferences = preferencesQuery.data ?? defaultPreferences;

  const toggleDeviceSubscription = async (checked: boolean) => {
    setDeviceBusy(true);
    try {
      if (!checked) {
        await unsubscribeFromWebPush();
        setNotificationEnabled(false);
        setDeviceSubscribed(false);
        return { ok: true as const, message: "Push notifications disabled on this device." };
      }

      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        if (permission === "denied") {
          throw new Error("Browser notifications are blocked.");
        }
        throw new Error("Notifications are not supported in this browser.");
      }

      await subscribeToWebPush();
      setNotificationEnabled(true);
      setDeviceSubscribed(true);
      return { ok: true as const, message: "Push notifications enabled on this device." };
    } finally {
      setDeviceBusy(false);
    }
  };

  const updatePreferences = async (
    next: NotificationPreferences,
    payload: UserNotificationPreferencesUpdateRequest
  ) => {
    const previous = preferences;
    queryClient.setQueryData(["notification-preferences"], next);
    try {
      const response = await sdk.userPreferences.updateNotifications(payload);
      const normalized = normalizePreferences(
        (response.preferences as NotificationPreferencesPatch | undefined) ?? next
      );
      queryClient.setQueryData(["notification-preferences"], normalized);
      return normalized;
    } catch (error) {
      queryClient.setQueryData(["notification-preferences"], previous);
      throw error;
    }
  };

  const toggleCategory = async (key: "render" | "publish" | "caption", enabled: boolean) => {
    const next = mergePreferences(preferences, {
      push: {
        groups: {
          content: {
            enabled: preferences.push.groups.content.enabled,
            items: {
              [key]: { enabled },
            },
          },
        },
      },
    });
    setSavingCategory(key);
    try {
      return await updatePreferences(next, {
        notifications: {
          push: {
            groups: {
              content: {
                items: {
                  [key]: { enabled },
                },
              },
            },
          },
        },
      });
    } finally {
      setSavingCategory(null);
    }
  };

  const toggleContentGroup = async (enabled: boolean) => {
    const next = mergePreferences(preferences, {
      push: {
        groups: {
          content: {
            items: preferences.push.groups.content.items,
            enabled,
          },
        },
      },
    });
    setGroupBusy(true);
    try {
      return await updatePreferences(next, {
        notifications: {
          push: {
            groups: {
              content: {
                enabled,
              },
            },
          },
        },
      });
    } finally {
      setGroupBusy(false);
    }
  };

  return {
    preferences,
    loading: preferencesQuery.isLoading,
    deviceSubscribed,
    deviceBusy,
    groupBusy,
    savingCategory,
    isWebPushSupported: isWebPushSupported(),
    toggleDeviceSubscription,
    toggleCategory,
    toggleContentGroup,
  };
};

type JobKind = NotificationKind;
type JobStatus = NotificationStatus;

const isActiveStatus = (status: JobStatus) =>
  status === "queued" ||
  status === "processing" ||
  status === "publishing" ||
  status === "rendering";
const isTerminalStatus = (status: JobStatus) =>
  status === "completed" || status === "failed" || status === "canceled";
const isCanceledStage = (stage?: string) =>
  typeof stage === "string" && stage.trim().toLowerCase().startsWith("cancel");
const normalizeJobStatus = (status: JobStatus, stage?: string): JobStatus => {
  if (
    isCanceledStage(stage) &&
    (status === "queued" || status === "processing" || status === "rendering")
  ) {
    return "canceled";
  }
  return status;
};

const toActivityJob = (item: ActivityHydratedItem): ActivityJob => ({
  key: item.key,
  id: item.contentId,
  title: item.title,
  jobId: item.jobId,
  mode: item.mode,
  kind: item.kind,
  status: normalizeJobStatus(item.status, item.stage),
  progress: item.progress,
  stage: item.stage,
  error: item.error,
  metadata: item.metadata,
  updatedAt: item.updatedAt,
});

const compareJobsByRecency = (left: ActivityJob, right: ActivityJob) => right.updatedAt - left.updatedAt;
const toPercent = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};
const parseTitleFromNotificationMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  const title = metadata?.title;
  if (typeof title !== "string") return undefined;
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : undefined;
};
export const parseRenderNameFromMetadata = (
  metadata: Record<string, unknown> | null | undefined
) => {
  const renderName = metadata?.renderName;
  if (typeof renderName !== "string") return undefined;
  const normalized = renderName.trim();
  return normalized.length > 0 ? normalized : undefined;
};
const parseNotificationKeyContext = (kind: JobKind, key: string) => {
  const prefix = `${kind}:`;
  if (!key.startsWith(prefix)) {
    return { jobId: undefined, mode: undefined } as const;
  }
  const parts = key.split(":");
  if (parts.length === 2) {
    return { jobId: parts[1], mode: undefined } as const;
  }
  if (parts.length >= 3) {
    return { jobId: undefined, mode: parts.slice(2).join(":") } as const;
  }
  return { jobId: undefined, mode: undefined } as const;
};
const pickPreferredJob = (left: ActivityJob, right: ActivityJob): ActivityJob => {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt > left.updatedAt ? right : left;
  }
  const leftHasMode = Boolean(left.mode);
  const rightHasMode = Boolean(right.mode);
  if (leftHasMode !== rightHasMode) {
    return rightHasMode ? right : left;
  }
  const leftProgress = toPercent(left.progress) ?? 0;
  const rightProgress = toPercent(right.progress) ?? 0;
  if (leftProgress !== rightProgress) {
    return rightProgress > leftProgress ? right : left;
  }
  return right;
};
const pickCanonicalJob = (left: ActivityJob, right: ActivityJob): ActivityJob => {
  const leftTerminal = isTerminalStatus(left.status);
  const rightTerminal = isTerminalStatus(right.status);
  if (leftTerminal !== rightTerminal) {
    if (!leftTerminal && rightTerminal) return right;
    if (leftTerminal && !rightTerminal) {
      const isFreshRestart = right.status === "queued" && right.updatedAt > left.updatedAt;
      return isFreshRestart ? right : left;
    }
  }
  return pickPreferredJob(left, right);
};
const dedupeJobs = (items: ActivityJob[]) => {
  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    const existing = map.get(item.key);
    map.set(item.key, existing ? pickPreferredJob(existing, item) : item);
  }
  return Array.from(map.values()).sort(compareJobsByRecency);
};
const dedupeCanonicalJobs = (items: ActivityJob[]) => {
  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    const existing = map.get(item.key);
    map.set(item.key, existing ? pickCanonicalJob(existing, item) : item);
  }
  return Array.from(map.values()).sort(compareJobsByRecency);
};
const dedupeActiveJobsBySubject = (items: ActivityJob[]) => {
  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    const subjectKey = item.jobId
      ? item.key
      : `${item.kind}:${item.id}:${item.mode ?? "default"}`;
    const existing = map.get(subjectKey);
    map.set(subjectKey, existing ? pickPreferredJob(existing, item) : item);
  }
  return Array.from(map.values()).sort(compareJobsByRecency);
};

const demoNotificationJobs: ActivityJob[] = [
  {
    key: "demo:publish:warning",
    id: "demo-publish-warning",
    title: "Demo publish with warning",
    kind: "publish",
    status: "completed",
    progress: 1,
    error: "Published successfully, but thumbnail optimization could not be applied.",
    updatedAt: Date.now() + 2,
  },
  {
    key: "demo:render:failed",
    id: "demo-render-failed",
    title: "Demo render failure",
    kind: "render",
    status: "failed",
    progress: 1,
    error: "Rendering failed because the source asset could not be decoded.",
    updatedAt: Date.now() + 1,
  },
];

export const useNotificationCenter = (open: boolean) => {
  const captionProgressMap = useCaptionProgress({ paused: !open });
  const publishProgressMap = usePublishProgress({ paused: !open });
  const [jobs, setJobs] = useState<Record<string, ActivityJob>>(() => {
    if (process.env.NODE_ENV !== "development") {
      return {};
    }
    return Object.fromEntries(
      demoNotificationJobs.map((job) => [job.key, job])
    ) as Record<string, ActivityJob>;
  });
  const { socket } = useSocketIO();

  const bootstrapQuery = useQuery({
    queryKey: ["notification-center", "bootstrap"],
    enabled: open,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [notifications, renderProgress] = await Promise.all([
        sdk.notifications.list({ limit: 100 }).catch(() => ({ items: [] })),
        sdk.content.progress().catch(() => ({ items: {} })),
      ]);

      const results: ActivityJob[] = [];
      const activityItems = notifications.items as ActivityHydratedItem[];
      activityItems.forEach((item) => {
        const keyContext = parseNotificationKeyContext(item.kind, item.key);
        const resolvedJobId = item.jobId ?? keyContext.jobId;
        const resolvedMode = item.mode ?? keyContext.mode;
        results.push(
          toActivityJob({
            ...item,
            jobId: resolvedJobId,
            mode: resolvedMode,
            title: parseTitleFromNotificationMetadata(item.metadata),
          })
        );
      });
      const terminalKeys = new Set(
        results.filter((item) => isTerminalStatus(item.status)).map((item) => item.key)
      );

      Object.values(renderProgress.items ?? {}).forEach((snapshot) => {
        const typed = snapshot as {
          id: string;
          jobId?: string;
          mode?: string;
          progress?: number;
        };
        const key = typed.jobId ? `render:${typed.jobId}` : `render:${typed.id}:${typed.mode ?? "default"}`;
        if (terminalKeys.has(key)) {
          return;
        }
        results.push({
          key,
          id: typed.id,
          title: undefined,
          jobId: typed.jobId,
          mode: typed.mode,
          kind: "render",
          status: "rendering",
          progress: typed.progress,
          updatedAt: Date.now(),
        });
      });

      return results;
    },
  });

  useEffect(() => {
    if (!socket) return;

    const upsert = (job: ActivityJob) => {
      setJobs((current) => {
        const existing = current[job.key];
        if (
          existing &&
          isTerminalStatus(existing.status) &&
          !isTerminalStatus(job.status) &&
          job.status !== "queued"
        ) {
          return current;
        }
        const resolvedTitle = job.title?.trim() || existing?.title;
        return {
          ...current,
          [job.key]: {
            ...(existing ?? {}),
            ...job,
            title: resolvedTitle,
          },
        };
      });
    };

    const removeJob = (jobKey: string) => {
      setJobs((current) => {
        if (!(jobKey in current)) return current;
        const next = { ...current };
        delete next[jobKey];
        return next;
      });
    };

    const handleRenderProgress = (payload: AppEventMap["render.progress"]) => {
      upsert({
        key: payload.key ?? (payload.jobId ? `render:${payload.jobId}` : `render:${payload.id}:${payload.mode ?? "default"}`),
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "render",
        status: "rendering",
        progress: payload.progress,
        metadata: payload.metadata,
        updatedAt: Date.now(),
      });
    };

    const handleRenderCompleted = (payload: AppEventMap["render.completed"]) => {
      if (!payload.id) return;
      const mode = "mode" in payload ? payload.mode : undefined;
      const metadata = (
        "metadata" in payload ? payload.metadata : undefined
      ) as Record<string, unknown> | null | undefined;
      const key = payload.jobId
        ? `render:${payload.jobId}`
        : `render:${payload.id}:${mode ?? "default"}`;
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(metadata),
        jobId: payload.jobId,
        mode,
        kind: "render",
        status: "completed",
        progress: 1,
        metadata,
        updatedAt: Date.now(),
      });
    };

    const handleRenderFailed = (payload: AppEventMap["render.failed"]) => {
      if (!payload.id) return;
      const mode = ("mode" in payload ? payload.mode : undefined) as string | undefined;
      const metadata = (
        "metadata" in payload ? payload.metadata : undefined
      ) as Record<string, unknown> | null | undefined;
      const error = ("error" in payload ? payload.error : undefined) as string | undefined;
      const key = payload.jobId
        ? `render:${payload.jobId}`
        : `render:${payload.id}:${mode ?? "default"}`;
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(metadata),
        jobId: payload.jobId,
        mode,
        kind: "render",
        status: "failed",
        error,
        metadata,
        updatedAt: Date.now(),
      });
    };

    const handleCaptionUpdate = (payload: AppEventMap["caption.update"]) => {
      upsert({
        key: payload.mode?.trim() ? `${payload.id}::${payload.mode.trim()}` : payload.id,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "caption",
        status: payload.status,
        progress: payload.progress,
        error: payload.error,
        metadata: payload.metadata,
        updatedAt: Date.now(),
      });
    };

    const handleCaptionCompleted = (payload: AppEventMap["caption.completed"]) => {
      handleCaptionUpdate({ ...payload, status: "completed" });
    };
    const handleCaptionFailed = (payload: AppEventMap["caption.failed"]) => {
      handleCaptionUpdate({ ...payload, status: "failed" });
    };

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.render.progress, handler: handleRenderProgress },
      { event: SocketEvents.render.completed, handler: handleRenderCompleted },
      { event: SocketEvents.render.failed, handler: handleRenderFailed },
      { event: SocketEvents.render.cancelRequested, handler: ({ id, jobId, mode }) => removeJob(jobId ? `render:${jobId}` : `render:${id}:${mode ?? "default"}`) },
      { event: SocketEvents.caption.update, handler: handleCaptionUpdate },
      { event: SocketEvents.caption.queued, handler: handleCaptionUpdate },
      { event: SocketEvents.caption.started, handler: handleCaptionUpdate },
      { event: SocketEvents.caption.completed, handler: handleCaptionCompleted },
      { event: SocketEvents.caption.failed, handler: handleCaptionFailed },
    ] as const);
  }, [socket]);

  const combinedJobs = useMemo(() => {
    const fromBootstrap = bootstrapQuery.data ?? [];
    const fromSocket = Object.values(jobs);
    return dedupeJobs([...fromBootstrap, ...fromSocket]);
  }, [bootstrapQuery.data, jobs]);
  const activeCaptionJobs = useMemo(
    () =>
      Object.values(captionProgressMap)
        .map((entry) => ({
          key: entry.key ?? `${entry.id}:${entry.mode ?? "default"}`,
          id: entry.id,
          title: parseTitleFromNotificationMetadata(entry.metadata),
          jobId: entry.jobId,
          mode: entry.mode,
          kind: "caption" as const,
          status: entry.status,
          progress: entry.progress,
          error: entry.error,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt ?? 0,
        }))
        .sort(compareJobsByRecency),
    [captionProgressMap]
  );
  const activePublishJobs = useMemo(
    () =>
      Object.values(publishProgressMap)
        .map((entry) => ({
          key: entry.key ?? `publish:${entry.jobId}`,
          id: entry.id,
          title: parseTitleFromNotificationMetadata(entry.metadata),
          jobId: entry.jobId,
          kind: "publish" as const,
          status: entry.status,
          progress: entry.progress,
          stage: entry.stage,
          error: entry.error,
          metadata: entry.metadata,
          updatedAt: entry.updatedAt ?? 0,
        }))
        .sort(compareJobsByRecency),
    [publishProgressMap]
  );
  const canonicalJobs = useMemo(
    () => dedupeCanonicalJobs([...combinedJobs, ...activePublishJobs, ...activeCaptionJobs]),
    [activeCaptionJobs, activePublishJobs, combinedJobs]
  );
  const activeJobs = useMemo(
    () => dedupeActiveJobsBySubject(canonicalJobs.filter((job) => isActiveStatus(job.status))),
    [canonicalJobs]
  );
  const recentJobs = useMemo(
    () => canonicalJobs.filter((job) => !isActiveStatus(job.status)).sort(compareJobsByRecency).slice(0, 20),
    [canonicalJobs]
  );

  return {
    activeJobs,
    recentJobs,
    loading: open && bootstrapQuery.isLoading && activeJobs.length === 0 && recentJobs.length === 0,
  };
};
