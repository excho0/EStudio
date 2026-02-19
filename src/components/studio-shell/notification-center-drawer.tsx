"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
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
import { toast } from "sonner";
import { notifyRenderComplete } from "@/lib/notifications";

type JobKind = "render" | "publish" | "caption";
type JobStatus =
  | "queued"
  | "processing"
  | "publishing"
  | "rendering"
  | "completed"
  | "failed";

type ActivityJob = {
  key: string;
  id: string;
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
  mode?: string;
  kind: JobKind;
  status: JobStatus;
  progress?: number;
  stage?: string;
  error?: string;
  updatedAt: number;
};

const COMPLETION_SOUND_SRC = "/sounds/render-complete.mp3";

const isActiveStatus = (status: JobStatus) =>
  status === "queued" ||
  status === "processing" ||
  status === "publishing" ||
  status === "rendering";

const toPercent = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const shortId = (id: string) => id.slice(0, 8);
const jobKey = (kind: JobKind, id: string, mode?: string) =>
  `${kind}:${id}:${mode ?? "default"}`;
const resolveJobHref = (job: ActivityJob) =>
  job.kind === "render"
    ? `/renders/${job.id}`
    : job.kind === "publish"
      ? `/publishes/${job.id}`
      : `/edit/${job.id}`;

const resolveKindLabel = (kind: JobKind) =>
  kind === "render" ? "Render" : kind === "publish" ? "Publish" : "Captions";

const resolveStatusLabel = (status: JobStatus) => {
  if (status === "rendering") return "Rendering";
  if (status === "publishing") return "Publishing";
  if (status === "processing") return "Processing";
  if (status === "queued") return "Queued";
  if (status === "completed") return "Completed";
  return "Failed";
};

const toActivityJob = (item: ActivityHydratedItem): ActivityJob => ({
  key: item.key,
  id: item.contentId,
  mode: item.mode,
  kind: item.kind,
  status: item.status,
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
  const hasScopedModeFor = new Set<string>();
  for (const item of items) {
    if ((item.kind === "render" || item.kind === "caption") && item.mode?.trim()) {
      hasScopedModeFor.add(`${item.kind}:${item.id}`);
    }
  }

  const map = new Map<string, ActivityJob>();
  for (const item of items) {
    const baseKey = `${item.kind}:${item.id}`;
    const mode = item.mode?.trim();
    const dedupeKey =
      item.kind === "publish"
        ? baseKey
        : mode
          ? `${baseKey}:${mode}`
          : `${baseKey}:__unscoped__`;
    if (!mode && hasScopedModeFor.has(baseKey) && item.kind !== "publish") {
      continue;
    }
    const existing = map.get(dedupeKey);
    if (!existing) {
      map.set(dedupeKey, item);
      continue;
    }
    map.set(dedupeKey, pickPreferredJob(existing, item));
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
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
  const kindLabel = resolveKindLabel(job.kind);
  const statusLabel = resolveStatusLabel(job.status);
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
      onClick={() => onOpen(resolveJobHref(job))}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {job.kind === "render" ? (
            <Clapperboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : job.kind === "publish" ? (
            <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <p className="truncate text-sm font-medium tracking-tight">
            {kindLabel} · #{shortId(job.id)}
          </p>
        </div>
        <Badge
          variant={job.status === "failed" ? "destructive" : "secondary"}
          className="h-6 rounded-full px-2 text-xs"
        >
          {job.status === "failed" ? (
            <XCircle className="mr-1 h-3 w-3" />
          ) : isActiveStatus(job.status) ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1 h-3 w-3" />
          )}
          {statusLabel}
        </Badge>
      </div>

      {/* <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{job.mode ?? "default mode"}</span>
        <span>{formatTime(job.updatedAt)}</span>
      </div> */}

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
  const completedNotifiedRef = useRef(new Set<string>());

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
        results.push(toActivityJob(item));
      });

      Object.values(renderProgress.items ?? {}).forEach((snapshot) => {
        const typed = snapshot as {
          id: string;
          mode?: string;
          progress?: number;
        };
        results.push({
          key: jobKey("render", typed.id, typed.mode),
          id: typed.id,
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
      setJobs((current) => ({ ...current, [job.key]: job }));
    };

    const notifyJobCompleted = (job: {
      key: string;
      kind: JobKind;
      id: string;
      mode?: string;
    }) => {
      if (completedNotifiedRef.current.has(job.key)) {
        return;
      }
      completedNotifiedRef.current.add(job.key);
      const kindLabel = resolveKindLabel(job.kind);
      const modeSuffix = job.mode ? ` · ${job.mode}` : "";
      const message = `${kindLabel} completed · #${shortId(job.id)}${modeSuffix}`;
      toast.success(message);
      notifyRenderComplete(`${kindLabel} complete`, message);
      const audio = new Audio(COMPLETION_SOUND_SRC);
      void audio.play().catch(() => undefined);
    };

    const handleRenderProgress = (payload: {
      id: string;
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
      const key = jobKey("render", payload.id, payload.mode);
      upsert({
        key,
        id: payload.id,
        mode: payload.mode,
        kind: "render",
        status: isCompleted ? "completed" : "rendering",
        progress: normalizedProgress,
        updatedAt: Date.now(),
      });
      if (isCompleted) {
        notifyJobCompleted({
          key,
          kind: "render",
          id: payload.id,
          mode: payload.mode,
        });
      }
    };

    const handleRenderComplete = (payload: { id: string; mode?: string }) => {
      const key = jobKey("render", payload.id, payload.mode);
      upsert({
        key,
        id: payload.id,
        mode: payload.mode,
        kind: "render",
        status: "completed",
        progress: 1,
        updatedAt: Date.now(),
      });
      notifyJobCompleted({
        key,
        kind: "render",
        id: payload.id,
        mode: payload.mode,
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
          kind: "render",
          status: "failed",
          progress: 1,
          updatedAt: Date.now(),
        });
      }
    };

    const handlePublishUpdate = (payload: {
      id: string;
      status: string;
      error?: string;
    }) => {
      const key = jobKey("publish", payload.id);
      const status: JobStatus =
        payload.status === "queued"
          ? "queued"
          : payload.status === "publishing"
            ? "publishing"
            : payload.status === "failed"
              ? "failed"
              : "completed";
      upsert({
        key,
        id: payload.id,
        kind: "publish",
        status,
        progress: status === "completed" ? 1 : undefined,
        error: payload.error,
        updatedAt: Date.now(),
      });
      if (status === "completed") {
        notifyJobCompleted({
          key,
          kind: "publish",
          id: payload.id,
        });
      }
    };

    const handlePublishProgress = (payload: {
      id: string;
      stage?: string;
      progress?: number;
    }) => {
      const key = jobKey("publish", payload.id);
      upsert({
        key,
        id: payload.id,
        kind: "publish",
        status: "publishing",
        progress: payload.progress,
        stage: payload.stage,
        updatedAt: Date.now(),
      });
    };

    const handleCaptionUpdate = (payload: {
      id: string;
      mode?: string;
      status: "queued" | "processing" | "completed" | "failed";
      progress?: number;
      error?: string;
    }) => {
      const key = jobKey("caption", payload.id, payload.mode);
      upsert({
        key,
        id: payload.id,
        mode: payload.mode,
        kind: "caption",
        status: payload.status,
        progress: payload.progress,
        error: payload.error,
        updatedAt: Date.now(),
      });
      if (payload.status === "completed") {
        notifyJobCompleted({
          key,
          kind: "caption",
          id: payload.id,
          mode: payload.mode,
        });
      }
    };

    socket.on("render:progress", handleRenderProgress);
    socket.on("render:complete", handleRenderComplete);
    socket.on("content:update", handleContentUpdate);
    socket.on("publish:update", handlePublishUpdate);
    socket.on("publish:progress", handlePublishProgress);
    socket.on("caption:update", handleCaptionUpdate);

    return () => {
      socket.off("render:progress", handleRenderProgress);
      socket.off("render:complete", handleRenderComplete);
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
        variant="outline"
        size="icon"
        aria-label="Open notification center"
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
          <ScrollArea className="h-[calc(100vh-8rem)] pr-1">
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
