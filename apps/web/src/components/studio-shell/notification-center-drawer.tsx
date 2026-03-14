"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Clapperboard,
  Upload,
  X,
  Captions,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { sdk } from "@/lib/sdk";
import { Separator } from "@/components/ui/separator";
import type { LucideIcon } from "lucide-react";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import type {
  AppEventMap,
  NotificationItem,
  NotificationKind,
  NotificationStatus,
} from "@/types";

type JobKind = NotificationKind;
type JobStatus = NotificationStatus;

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

type ActivityJob = Omit<ActivityHydratedItem, "contentId"> & {
  id: string;
};

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

const toPercent = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const shortId = (id: string) => id.slice(0, 8);
const jobKey = (kind: JobKind, id: string, mode?: string, jobId?: string) =>
  jobId ? `${kind}:${jobId}` : `${kind}:${id}:${mode ?? "default"}`;

const JOB_KIND_REGISTRY: Record<
  JobKind,
  { label: string; icon: LucideIcon; href: (id: string) => string }
> = {
  render: { label: "Render", icon: Clapperboard, href: (id) => `/renders/${id}` },
  publish: { label: "Publish", icon: Upload, href: (id) => `/publishes/${id}` },
  caption: { label: "Captions", icon: Captions, href: (id) => `/edit/${id}` },
};

const resolveKindMeta = (kind: JobKind) => JOB_KIND_REGISTRY[kind];
const resolvePublishStatus = (status: string): JobStatus =>
  status === "queued"
    ? "queued"
    : status === "publishing"
      ? "publishing"
      : status === "failed"
        ? "failed"
        : "completed";
const compareJobsByRecency = (left: ActivityJob, right: ActivityJob) => {
  return right.updatedAt - left.updatedAt;
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

const dedupeJobs = (items: ActivityJob[]) => {
  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    const dedupeKey = item.key;
    const existing = map.get(dedupeKey);
    if (!existing) {
      map.set(dedupeKey, item);
      continue;
    }
    map.set(dedupeKey, pickPreferredJob(existing, item));
  }
  return Array.from(map.values()).sort(compareJobsByRecency);
};

const dedupeActiveJobsBySubject = (items: ActivityJob[]) => {
  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    // Keep per-job entries visible when we have a concrete job id.
    const subjectKey = item.jobId
      ? item.key
      : `${item.kind}:${item.id}:${item.mode ?? "default"}`;
    const existing = map.get(subjectKey);
    if (!existing) {
      map.set(subjectKey, item);
      continue;
    }
    map.set(subjectKey, pickPreferredJob(existing, item));
  }
  return Array.from(map.values()).sort(compareJobsByRecency);
};

const parseTitleFromNotificationMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  const title = metadata?.title;
  if (typeof title !== "string") return undefined;
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const parseRenderNameFromMetadata = (
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

const SectionHeader = ({
  title,
  count,
  variant,
}: {
  title: string;
  count: number;
  variant: "secondary" | "outline";
}) => (
  <div className="mb-2 flex items-center justify-between">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
    <Badge className="rounded-full px-1.5 size-6" variant={variant}>{count}</Badge>
  </div>
);

const JobCard = ({
  job,
  onOpen,
}: {
  job: ActivityJob;
  onOpen: (job: ActivityJob) => void;
}) => {
  const kindMeta = resolveKindMeta(job.kind);
  const KindIcon = kindMeta.icon;
  const progressValue = toPercent(job.progress);
  const isProgressStatus =
    job.status === "processing" ||
    job.status === "publishing" ||
    job.status === "rendering";
  const showProgress =
    isProgressStatus &&
    (job.kind === "render" || job.kind === "caption" || job.kind === "publish") &&
    typeof progressValue === "number";
  const modeLabel = job.mode?.trim();
  const showMode = job.kind !== "publish" && Boolean(modeLabel);
  const hasWarning =
    job.status === "completed" &&
    typeof job.error === "string" &&
    job.error.trim().length > 0;
  const hasError =
    job.status === "failed" &&
    typeof job.error === "string" &&
    job.error.trim().length > 0;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
      type="button"
      className="w-full rounded-xl bg-muted/30 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpen(job)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KindIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium tracking-tight">
            {kindMeta.label} · {job.title?.trim() || `#${shortId(job.id)}`}
          </p>
        </div>
        <JobStatusBadge
          status={job.status}
          showLabel
          className={
            hasWarning
              ? "border-emerald-300/60 bg-gradient-to-r from-amber-100 via-lime-100 to-emerald-100 text-emerald-900 dark:border-emerald-400/40 dark:from-amber-500/25 dark:via-lime-500/20 dark:to-emerald-500/25 dark:text-emerald-100 [&_svg]:text-amber-700 dark:[&_svg]:text-lime-200"
              : undefined
          }
        />
      </div>

      {showMode ? (
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{modeLabel}</span>
        </div>
      ) : null}

      {showProgress ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{job.stage ?? "Progress"}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>
      ) : null}

      {hasWarning ? (
        <Alert variant="warning" appearance="light" size="sm" className="mt-2">
          <AlertIcon>
            <TriangleAlert className="h-4 w-4" />
          </AlertIcon>
          <AlertContent>
            <AlertTitle className="capitalize">warning</AlertTitle>
            <AlertDescription className="line-clamp-2">
              {job.error}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {hasError ? (
        <Alert variant="destructive" appearance="light" size="sm" className="mt-2">
          <AlertIcon>
            <X className="h-4 w-4" />
          </AlertIcon>
          <AlertContent>
            <AlertTitle className="capitalize">failed</AlertTitle>
            <AlertDescription className="line-clamp-2 ">
              {job.error}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
    </motion.button>
  );
};

const NotificationSkeletonCard = ({ index }: { index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
    transition={{ duration: 0.25, delay: index * 0.06 }}
    className="w-full rounded-xl bg-muted/20 px-3 py-3"
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-3.5 w-40 rounded-sm" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <div className="mb-2 flex items-center justify-between">
      <Skeleton className="h-2.5 w-24 rounded-sm" />
      <Skeleton className="h-2.5 w-10 rounded-sm" />
    </div>
    <Skeleton className="h-1.5 w-full rounded-full" />
  </motion.div>
);

const NotificationSkeletonList = () => (
  <div className="space-y-2">
    {[0, 1, 2, 3].map((index) => (
      <NotificationSkeletonCard key={index} index={index} />
    ))}
  </div>
);

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

export function NotificationCenterDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        const key = jobKey("render", typed.id, typed.mode, typed.jobId);
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
        // Ignore out-of-order regressions (e.g. late progress after completion).
        // Allow explicit requeue transitions to reopen the same job key.
        if (
          existing &&
          isTerminalStatus(existing.status) &&
          !isTerminalStatus(job.status) &&
          job.status !== "queued"
        ) {
          return current;
        }
        const resolvedTitle = job.title?.trim() || existing?.title;
        const nextJob = {
          ...job,
          title: resolvedTitle,
        };
        if (
          existing &&
          isTerminalStatus(existing.status) &&
          !isTerminalStatus(job.status)
        ) {
          const archivedKey = `${existing.key}:attempt:${existing.updatedAt}`;
          return {
            ...current,
            [archivedKey]: {
              ...existing,
              key: archivedKey,
            },
            [job.key]: nextJob,
          };
        }
        return { ...current, [job.key]: nextJob };
      });
    };

    const handleRenderProgress = (payload: AppEventMap["render.progress"]) => {
      const progressValue = Number.isFinite(payload.progress ?? NaN)
        ? Number(payload.progress)
        : 0;
      const normalizedProgress =
        progressValue > 1 ? progressValue / 100 : progressValue;
      const rendered = Number.isFinite(payload.rendered ?? NaN)
        ? Number(payload.rendered)
        : null;
      const total = Number.isFinite(payload.total ?? NaN)
        ? Number(payload.total)
        : null;
      const isCompleted =
        normalizedProgress >= 1 ||
        (rendered !== null && total !== null && total > 0 && rendered >= total);
      const key = jobKey("render", payload.id, payload.mode, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "render",
        status: normalizeJobStatus(isCompleted ? "completed" : "rendering"),
        progress: normalizedProgress,
        updatedAt: Date.now(),
      });
    };

    const handleRenderComplete = (payload: AppEventMap["render.completed"]) => {
      if (!payload.id) return;
      const mode = "mode" in payload ? payload.mode : undefined;
      const key = jobKey("render", payload.id, mode, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: "metadata" in payload
          ? parseTitleFromNotificationMetadata(payload.metadata)
          : undefined,
        jobId: payload.jobId,
        mode,
        kind: "render",
        status: "completed",
        progress: 1,
        metadata: "metadata" in payload ? payload.metadata : undefined,
        updatedAt: Date.now(),
      });
    };

    const handleRenderCancelRequested = (
      payload: AppEventMap["render.cancel-requested"]
    ) => {
      const now = Date.now();
      setJobs((current) => {
        const next = { ...current };
        const title = undefined;
        const hasExactTarget = Boolean(payload.jobId);
        let matched = false;

        Object.entries(current).forEach(([key, job]) => {
          if (job.kind !== "render" || job.id !== payload.id) return;
          if (hasExactTarget && job.jobId !== payload.jobId) return;
          if (!hasExactTarget && isTerminalStatus(job.status)) return;
          matched = true;
          next[key] = {
            ...job,
            status: "canceled",
            stage: "Canceled",
            progress: 1,
            updatedAt: now,
          };
        });

        if (!matched) {
          const fallbackKey = jobKey("render", payload.id, payload.mode, payload.jobId);
          next[fallbackKey] = {
            key: fallbackKey,
            id: payload.id,
            title,
            jobId: payload.jobId,
            mode: payload.mode,
            kind: "render",
            status: "canceled",
            progress: 1,
            stage: "Canceled",
            updatedAt: now,
          };
        }

        return next;
      });
    };

    const handleContentUpdate = (payload: AppEventMap["content.update"]) => {
      if (!payload.id || payload.type !== "content.status") return;
      if (payload.status === "failed") {
        const key = jobKey("render", payload.id);
        upsert({
          key,
          id: payload.id,
          title: undefined,
          kind: "render",
          status: "failed",
          progress: 1,
          updatedAt: Date.now(),
        });
      }
    };

    const handlePublishUpdate = (payload: AppEventMap["publish.update"]) => {
      const key = jobKey("publish", payload.id, undefined, payload.jobId);
      const status = resolvePublishStatus(payload.status);
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        kind: "publish",
        status,
        progress: status === "completed" ? 1 : undefined,
        error: payload.error,
        updatedAt: Date.now(),
      });
    };

    const handlePublishProgress = (payload: AppEventMap["publish.progress"]) => {
      const key = jobKey("publish", payload.id, undefined, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        kind: "publish",
        status: "publishing",
        progress: payload.progress,
        stage: payload.stage,
        updatedAt: Date.now(),
      });
      // Progress replay after reconnect should not retrigger start toast.
    };

    const handleCaptionUpdate = (payload: AppEventMap["caption.update"]) => {
      const key = jobKey("caption", payload.id, payload.mode, payload.jobId);
      const normalizedStatus = normalizeJobStatus(payload.status);
      const fallbackProgress =
        normalizedStatus === "queued"
          ? 0
          : normalizedStatus === "processing"
            ? 0.1
            : normalizedStatus === "completed" || normalizedStatus === "failed"
              ? 1
              : undefined;
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "caption",
        status: normalizedStatus,
        progress: payload.progress ?? fallbackProgress,
        error: payload.error,
        updatedAt: Date.now(),
      });
    };

    const handleRenderQueued = (payload: AppEventMap["render.queued"]) => {
      const key = jobKey("render", payload.id, payload.mode, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: parseTitleFromNotificationMetadata(payload.metadata),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "render",
        status: "queued",
        progress: 0,
        updatedAt: Date.now(),
      });
    };

    const handleRenderStarted = (payload: AppEventMap["render.started"]) => {
      if (!payload.id) return;
      const key = jobKey("render", payload.id, undefined, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: undefined,
        jobId: payload.jobId,
        kind: "render",
        status: "rendering",
        updatedAt: Date.now(),
      });
    };

    const handleRenderFailed = (payload: AppEventMap["render.failed"]) => {
      if (!payload.id) return;
      const key = jobKey("render", payload.id, undefined, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: undefined,
        jobId: payload.jobId,
        kind: "render",
        status: "failed",
        progress: 1,
        updatedAt: Date.now(),
      });
    };

    const handlePublishQueued = (payload: AppEventMap["publish.queued"]) => {
      handlePublishUpdate({
        id: payload.id,
        jobId: payload.jobId,
        status: "queued",
      });
    };
    const handlePublishStarted = (payload: AppEventMap["publish.started"]) => {
      handlePublishUpdate({ ...payload, status: "publishing" });
    };
    const handlePublishCompleted = (payload: AppEventMap["publish.completed"]) => {
      handlePublishUpdate({ ...payload, status: "published" });
    };
    const handlePublishFailed = (payload: AppEventMap["publish.failed"]) => {
      handlePublishUpdate({ ...payload, status: "failed" });
    };

    const handleCaptionQueued = (payload: AppEventMap["caption.queued"]) => {
      handleCaptionUpdate({ ...payload, status: "queued" });
    };
    const handleCaptionStarted = (payload: AppEventMap["caption.started"]) => {
      handleCaptionUpdate({ ...payload, status: "processing" });
    };
    const handleCaptionCompleted = (payload: AppEventMap["caption.completed"]) => {
      handleCaptionUpdate({ ...payload, status: "completed" });
    };
    const handleCaptionFailed = (payload: AppEventMap["caption.failed"]) => {
      handleCaptionUpdate({ ...payload, status: "failed" });
    };

    const socketSubscriptions = [
      { event: SocketEvents.render.queued, handler: handleRenderQueued },
      { event: SocketEvents.render.started, handler: handleRenderStarted },
      { event: SocketEvents.render.progress, handler: handleRenderProgress },
      { event: SocketEvents.render.completed, handler: handleRenderComplete },
      { event: SocketEvents.render.failed, handler: handleRenderFailed },
      { event: SocketEvents.render.cancelRequested, handler: handleRenderCancelRequested },
      { event: SocketEvents.content.update, handler: handleContentUpdate },
      { event: SocketEvents.content.statusChanged, handler: handleContentUpdate },
      { event: SocketEvents.publish.update, handler: handlePublishUpdate },
      { event: SocketEvents.publish.queued, handler: handlePublishQueued },
      { event: SocketEvents.publish.started, handler: handlePublishStarted },
      { event: SocketEvents.publish.progress, handler: handlePublishProgress },
      { event: SocketEvents.publish.completed, handler: handlePublishCompleted },
      { event: SocketEvents.publish.failed, handler: handlePublishFailed },
      { event: SocketEvents.caption.update, handler: handleCaptionUpdate },
      { event: SocketEvents.caption.queued, handler: handleCaptionQueued },
      { event: SocketEvents.caption.started, handler: handleCaptionStarted },
      { event: SocketEvents.caption.completed, handler: handleCaptionCompleted },
      { event: SocketEvents.caption.failed, handler: handleCaptionFailed },
    ] as const;

    return attachSocketSubscriptions(socket, socketSubscriptions);
  }, [socket]);

  const combinedJobs = useMemo(() => {
    const fromBootstrap = bootstrapQuery.data ?? [];
    const fromSocket = Object.values(jobs);
    // Socket updates are appended last so they win during dedupe ties.
    return dedupeJobs([...fromBootstrap, ...fromSocket]);
  }, [bootstrapQuery.data, jobs]);
  const sortedJobs = combinedJobs;
  const activeJobs = useMemo(() => {
    return dedupeActiveJobsBySubject(sortedJobs.filter((job) => isActiveStatus(job.status)));
  }, [sortedJobs]);

  const recentJobs = useMemo(() => {
    return sortedJobs
      .filter((job) => !isActiveStatus(job.status))
      .sort(compareJobsByRecency)
      .slice(0, 20);
  }, [sortedJobs]);
  const showLoadingSkeleton =
    open &&
    bootstrapQuery.isLoading &&
    activeJobs.length === 0 &&
    recentJobs.length === 0;
  const openJob = (job: ActivityJob) => {
    setOpen(false);
    const href = resolveKindMeta(job.kind).href(job.id);
    if (job.kind !== "render" || job.status !== "completed") {
      router.push(href);
      return;
    }
    const renderName = parseRenderNameFromMetadata(job.metadata);
    if (!renderName) {
      router.push(href);
      return;
    }
    const searchParams = new URLSearchParams({ preview: renderName });
    router.push(`${href}?${searchParams.toString()}`);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Open notification center"
        className="rounded-full border"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
      </Button>
      <DrawerContent className="w-screen max-w-none data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none sm:min-w-[520px] sm:max-w-[620px] sm:data-[vaul-drawer-direction=right]:w-[620px]">
        <DrawerHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <DrawerTitle className="text-base">Notification Center</DrawerTitle>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close notification center"
              >
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <Separator className="mb-4" />
        <div className="px-4 pb-4">
          <ScrollArea
            className="h-[calc(100svh-5.5rem)]"
            contentGap="0.5rem"

          >
            <AnimatePresence mode="wait">
              {showLoadingSkeleton ? (
                <motion.div
                  key="notifications-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <section>
                    <SectionHeader title="Active" count={0} variant="secondary" />
                    <NotificationSkeletonList />
                  </section>
                </motion.div>
              ) : (
                <motion.div
                  key="notifications-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <section>
                    <SectionHeader
                      title="Active"
                      count={activeJobs.length}
                      variant="secondary"
                    />
                    {activeJobs.length > 0 ? (
                      <motion.div layout className="space-y-2">
                        <AnimatePresence initial={false} mode="popLayout">
                          {activeJobs.map((job) => (
                            <JobCard key={job.key} job={job} onOpen={openJob} />
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active jobs right now.
                      </p>
                    )}
                  </section>
                  <section>
                    <SectionHeader
                      title="Recent"
                      count={recentJobs.length}
                      variant="outline"
                    />
                    {recentJobs.length > 0 ? (
                      <motion.div layout className="space-y-2">
                        <AnimatePresence initial={false} mode="popLayout">
                          {recentJobs.map((job) => (
                            <JobCard key={job.key} job={job} onOpen={openJob} />
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Recent job updates will appear here.
                      </p>
                    )}
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
