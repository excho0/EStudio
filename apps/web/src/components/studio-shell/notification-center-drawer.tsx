"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CircleSlash,
  CheckCircle2,
  Clapperboard,
  Loader2,
  Sparkles,
  Upload,
  X,
  XCircle,
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

type JobKind = "render" | "publish" | "caption";
type JobStatus =
  | "queued"
  | "processing"
  | "publishing"
  | "rendering"
  | "canceled"
  | "completed"
  | "failed";

type ActivityJob = {
  key: string;
  id: string;
  title?: string;
  jobId?: string;
  mode?: string;
  kind: JobKind;
  status: JobStatus;
  progress?: number;
  stage?: string;
  error?: string;
  updatedAt: number;
};

type ActivityHydratedItem = {
  key: string;
  contentId: string;
  contentTitle?: string;
  jobId?: string;
  mode?: string;
  kind: JobKind;
  status: JobStatus;
  progress?: number;
  stage?: string;
  error?: string;
  updatedAt: number;
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
  caption: { label: "Captions", icon: Sparkles, href: (id) => `/edit/${id}` },
};

const JOB_STATUS_REGISTRY: Record<
  JobStatus,
  {
    label: string;
    icon: LucideIcon;
    badgeVariant: "secondary" | "destructive";
    iconClassName?: string;
  }
> = {
  queued: { label: "Queued", icon: Loader2, badgeVariant: "secondary", iconClassName: "animate-spin" },
  processing: { label: "Processing", icon: Loader2, badgeVariant: "secondary", iconClassName: "animate-spin" },
  publishing: { label: "Publishing", icon: Loader2, badgeVariant: "secondary", iconClassName: "animate-spin" },
  rendering: { label: "Rendering", icon: Loader2, badgeVariant: "secondary", iconClassName: "animate-spin" },
  canceled: { label: "Canceled", icon: CircleSlash, badgeVariant: "secondary" },
  completed: { label: "Completed", icon: CheckCircle2, badgeVariant: "secondary" },
  failed: { label: "Failed", icon: XCircle, badgeVariant: "destructive" },
};

const resolveKindMeta = (kind: JobKind) => JOB_KIND_REGISTRY[kind];
const resolveStatusMeta = (status: JobStatus) => JOB_STATUS_REGISTRY[status];
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
  title: item.contentTitle,
  jobId: item.jobId,
  mode: item.mode,
  kind: item.kind,
  status: normalizeJobStatus(item.status, item.stage),
  progress: item.progress,
  stage: item.stage,
  error: item.error,
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
  onOpen: (href: string) => void;
}) => {
  const kindMeta = resolveKindMeta(job.kind);
  const statusMeta = resolveStatusMeta(job.status);
  const KindIcon = kindMeta.icon;
  const StatusIcon = statusMeta.icon;
  const progressValue = toPercent(job.progress);
  const showProgress =
    typeof progressValue === "number" &&
    (isActiveStatus(job.status) || progressValue < 100);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
      type="button"
      className="w-full rounded-xl bg-muted/30 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpen(kindMeta.href(job.id))}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KindIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium tracking-tight">
            {kindMeta.label} · {job.title?.trim() || `#${shortId(job.id)}`}
          </p>
        </div>
        <Badge
          variant={statusMeta.badgeVariant}
          className="h-6 rounded-full px-2 text-xs"
        >
          <StatusIcon className={`mr-1 h-3 w-3 ${statusMeta.iconClassName ?? ""}`} />
          {statusMeta.label}
        </Badge>
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{job.mode ?? "default mode"}</span>
      </div>

      {showProgress ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{job.stage ?? "Progress"}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>
      ) : null}

      {job.error ? (
        <p className="mt-2 line-clamp-2 text-[11px] text-destructive">{job.error}</p>
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

export function NotificationCenterDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Record<string, ActivityJob>>({});
  const { socket } = useSocketIO();
  const titleByContentIdRef = useRef<Map<string, string>>(new Map());

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
      const contentIds = Array.from(
        new Set(
          (notifications.items as ActivityHydratedItem[])
            .map((item) => item.contentId)
            .filter(Boolean)
        )
      );
      const titleEntries = await Promise.all(
        contentIds.map(async (contentId) => {
          try {
            const content = await sdk.content.get(contentId);
            return [contentId, content.title] as const;
          } catch {
            return [contentId, undefined] as const;
          }
        })
      );
      const titleMap = new Map<string, string | undefined>(titleEntries);
      titleEntries.forEach(([contentId, title]) => {
        if (title) {
          titleByContentIdRef.current.set(contentId, title);
        }
      });

      const results: ActivityJob[] = [];
      const activityItems = notifications.items as ActivityHydratedItem[];
      activityItems.forEach((item) => {
        results.push(
          toActivityJob({
            ...item,
            contentTitle: titleMap.get(item.contentId),
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
          title: titleMap.get(typed.id),
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
          !isTerminalStatus(job.status)
        ) {
          return current;
        }
        return { ...current, [job.key]: job };
      });
    };

    const handleRenderProgress = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      progress?: number;
      rendered?: number;
      total?: number;
    }) => {
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
        title: titleByContentIdRef.current.get(payload.id),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "render",
        status: normalizeJobStatus(isCompleted ? "completed" : "rendering"),
        progress: normalizedProgress,
        updatedAt: Date.now(),
      });
    };

    const handleRenderComplete = (payload: { id: string; jobId?: string; mode?: string }) => {
      const key = jobKey("render", payload.id, payload.mode, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: titleByContentIdRef.current.get(payload.id),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "render",
        status: "completed",
        progress: 1,
        updatedAt: Date.now(),
      });
    };

    const handleRenderCancelRequested = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
    }) => {
      const now = Date.now();
      setJobs((current) => {
        const next = { ...current };
        const title = titleByContentIdRef.current.get(payload.id);
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

    const handleContentUpdate = (payload: {
      id?: string;
      status?: string;
      type?: string;
    }) => {
      if (!payload.id || payload.type !== "content:status") return;
      if (payload.status === "failed") {
        const key = jobKey("render", payload.id);
        upsert({
          key,
          id: payload.id,
          title: titleByContentIdRef.current.get(payload.id),
          kind: "render",
          status: "failed",
          progress: 1,
          updatedAt: Date.now(),
        });
      }
    };

    const handlePublishUpdate = (payload: {
      id: string;
      jobId?: string;
      status: string;
      error?: string;
    }) => {
      const key = jobKey("publish", payload.id, undefined, payload.jobId);
      const status = resolvePublishStatus(payload.status);
      upsert({
        key,
        id: payload.id,
        title: titleByContentIdRef.current.get(payload.id),
        jobId: payload.jobId,
        kind: "publish",
        status,
        progress: status === "completed" ? 1 : undefined,
        error: payload.error,
        updatedAt: Date.now(),
      });
    };

    const handlePublishProgress = (payload: {
      id: string;
      jobId?: string;
      stage?: string;
      progress?: number;
    }) => {
      const key = jobKey("publish", payload.id, undefined, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: titleByContentIdRef.current.get(payload.id),
        jobId: payload.jobId,
        kind: "publish",
        status: "publishing",
        progress: payload.progress,
        stage: payload.stage,
        updatedAt: Date.now(),
      });
      // Progress replay after reconnect should not retrigger start toast.
    };

    const handleCaptionUpdate = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      status: "queued" | "processing" | "completed" | "failed";
      progress?: number;
      error?: string;
    }) => {
      const key = jobKey("caption", payload.id, payload.mode, payload.jobId);
      upsert({
        key,
        id: payload.id,
        title: titleByContentIdRef.current.get(payload.id),
        jobId: payload.jobId,
        mode: payload.mode,
        kind: "caption",
        status: normalizeJobStatus(payload.status),
        progress: payload.progress,
        error: payload.error,
        updatedAt: Date.now(),
      });
    };

    socket.on("render:progress", handleRenderProgress);
    socket.on("render:complete", handleRenderComplete);
    socket.on("render:cancel-requested", handleRenderCancelRequested);
    socket.on("content:update", handleContentUpdate);
    socket.on("publish:update", handlePublishUpdate);
    socket.on("publish:progress", handlePublishProgress);
    socket.on("caption:update", handleCaptionUpdate);

    return () => {
      socket.off("render:progress", handleRenderProgress);
      socket.off("render:complete", handleRenderComplete);
      socket.off("render:cancel-requested", handleRenderCancelRequested);
      socket.off("content:update", handleContentUpdate);
      socket.off("publish:update", handlePublishUpdate);
      socket.off("publish:progress", handlePublishProgress);
      socket.off("caption:update", handleCaptionUpdate);
    };
  }, [socket]);

  const combinedJobs = useMemo(() => {
    const fromBootstrap = bootstrapQuery.data ?? [];
    const fromSocket = Object.values(jobs);
    // Socket updates are appended last so they win during dedupe ties.
    return dedupeJobs([...fromBootstrap, ...fromSocket]);
  }, [bootstrapQuery.data, jobs]);
  const sortedJobs = combinedJobs;
  const activeJobs = sortedJobs.filter((job) => isActiveStatus(job.status));
  const recentJobs = sortedJobs
    .filter((job) => !isActiveStatus(job.status))
    .sort(compareJobsByRecency)
    .slice(0, 20);
  const showLoadingSkeleton =
    open &&
    bootstrapQuery.isLoading &&
    activeJobs.length === 0 &&
    recentJobs.length === 0;
  const openJob = (href: string) => {
    setOpen(false);
    router.push(href);
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
