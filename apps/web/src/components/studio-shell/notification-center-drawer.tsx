"use client";

import { useState } from "react";
import {
  Bell,
  Captions,
  Clapperboard,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityJob,
  parseRenderNameFromMetadata,
  useNotificationCenter,
} from "@/hooks/use-notifications";

type JobKind = ActivityJob["kind"];

const shortId = (id: string) => id.slice(0, 8);

const toPercent = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const JOB_KIND_REGISTRY: Record<
  JobKind,
  { label: string; icon: LucideIcon; href: (id: string) => string }
> = {
  render: { label: "Render", icon: Clapperboard, href: (id) => `/renders/${id}` },
  publish: { label: "Publish", icon: Upload, href: (id) => `/publishes/${id}` },
  caption: { label: "Captions", icon: Captions, href: (id) => `/edit/${id}` },
};

const resolveKindMeta = (kind: JobKind) => JOB_KIND_REGISTRY[kind];

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
    <Badge className="size-6 rounded-full px-1.5" variant={variant}>
      {count}
    </Badge>
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
              ? "border-emerald-300/60 bg-linear-to-r from-amber-100 via-lime-100 to-emerald-100 text-emerald-900 dark:border-emerald-400/40 dark:from-amber-500/25 dark:via-lime-500/20 dark:to-emerald-500/25 dark:text-emerald-100 [&_svg]:text-amber-700 dark:[&_svg]:text-lime-200"
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
            <AlertDescription className="line-clamp-2">{job.error}</AlertDescription>
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
            <AlertDescription className="line-clamp-2">{job.error}</AlertDescription>
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
    {[0, 1, 2, 3, 5, 6, 7, 8].map((index) => (
      <NotificationSkeletonCard key={index} index={index} />
    ))}
  </div>
);

export function NotificationCenterDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { activeJobs, recentJobs, loading } = useNotificationCenter(open);

  const showLoadingSkeleton =
    open && loading && activeJobs.length === 0 && recentJobs.length === 0;

  const openJob = (job: ActivityJob) => {
    const basePath = resolveKindMeta(job.kind).href(job.id);
    if (job.kind !== "render") {
      router.push(basePath);
      setOpen(false);
      return;
    }
    const renderName = parseRenderNameFromMetadata(job.metadata);
    const params = renderName
      ? `?render=${encodeURIComponent(renderName)}`
      : "";
    router.push(`${basePath}${params}`);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <Button
        variant="outline"
        size="icon"
        className="relative rounded-full"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {activeJobs.length > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 size-5 rounded-full px-0 text-[10px]"
          >
            {Math.min(activeJobs.length, 9)}
          </Badge>
        ) : null}
      </Button>
      <DrawerContent className="w-screen max-w-none data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none sm:min-w-130 sm:max-w-155 sm:data-[vaul-drawer-direction=right]:w-155">
        <DrawerHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="space-y-1 text-left">
            <DrawerTitle className="text-base">Notifications</DrawerTitle>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <ScrollArea className="h-[calc(100vh-84px)]">
          <div className="space-y-6 p-4">
            {showLoadingSkeleton ? <NotificationSkeletonList /> : null}

            {!showLoadingSkeleton ? (
              <>
                <section>
                  <SectionHeader
                    title="Active"
                    count={activeJobs.length}
                    variant="secondary"
                  />
                  {activeJobs.length > 0 ? (
                    <AnimatePresence mode="popLayout" initial={false}>
                      <div className="space-y-2">
                        {activeJobs.map((job) => (
                          <JobCard key={job.key} job={job} onOpen={openJob} />
                        ))}
                      </div>
                    </AnimatePresence>
                  ) : (
                    <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      No active jobs right now.
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <SectionHeader
                    title="Recent"
                    count={recentJobs.length}
                    variant="outline"
                  />
                  {recentJobs.length > 0 ? (
                    <AnimatePresence mode="popLayout" initial={false}>
                      <div className="space-y-2">
                        {recentJobs.map((job) => (
                          <JobCard key={job.key} job={job} onOpen={openJob} />
                        ))}
                      </div>
                    </AnimatePresence>
                  ) : (
                    <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      Recent finished jobs will show up here.
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
