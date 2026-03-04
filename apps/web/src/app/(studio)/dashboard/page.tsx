"use client";

import type { ReactNode } from "react";
import { Link } from "@/components/navigation/route-transition";
import { Button } from "@/components/ui/button";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { useContentList } from "@/components/studio/use-content-list";
import type { ContentItem } from "@/types";
import { useRenderProgress } from "@/components/studio/use-render-progress";
import {
  Activity,
  CheckCircle2,
  CircleCheck,
  Loader2,
  Play,
  XCircle,
  TriangleAlert,
  Sparkles,
  Film,
  Music,
  SlidersHorizontal,
  Send,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { StatRow } from "@/components/ui/stat-row";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";

const CardHeaderRow = ({
  label,
  icon,
  iconClassName,
}: {
  label: string;
  icon: ReactNode;
  iconClassName?: string;
}) => (
  <div className="flex items-center justify-between">
    <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
      {label}
    </p>
    <span
      className={[
        "rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300",
        iconClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
    </span>
  </div>
);

const ValueWithSkeleton = ({
  loading,
  value,
  skeletonClassName,
}: {
  loading: boolean;
  value: ReactNode;
  skeletonClassName: string;
}) => (
  <div className="mt-3 text-3xl font-semibold">
    {loading ? <Skeleton className={skeletonClassName} /> : value}
  </div>
);


export default function DashboardOverviewPage() {
  const { items, loading } = useContentList();
  const renderProgress = useRenderProgress();
  const getEffectiveStatus = (item: ContentItem) =>
    renderProgress[item.id] ? "rendering" : item.status;
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value)
    );

  const rendered = items.filter(
    (item: ContentItem) => getEffectiveStatus(item) === "rendered"
  ).length;
  const failed = items.filter(
    (item: ContentItem) => getEffectiveStatus(item) === "failed"
  ).length;
  const recent = items.slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow
            label="Total Projects"
            icon={<Activity className="h-4 w-4" />}
          />
          <ValueWithSkeleton
            loading={loading}
            value={items.length}
            skeletonClassName="h-8 w-16"
          />
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow
            label="Rendered"
            icon={<CircleCheck className="h-4 w-4" />}
            iconClassName="border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          />
          <ValueWithSkeleton
            loading={loading}
            value={rendered}
            skeletonClassName="h-8 w-16"
          />
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow
            label="Failed"
            icon={<TriangleAlert className="h-4 w-4" />}
            iconClassName="border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          />
          <ValueWithSkeleton
            loading={loading}
            value={failed}
            skeletonClassName="h-8 w-16"
          />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(420px,1fr)_minmax(280px,500px)]">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent Projects</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Latest uploads and render activity.
              </p>
            </div>

            <div className="flex gap-4">
              {/* <span className="hidden items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 sm:flex">
                <Sparkles className="h-4 w-4" />
                Freshly synced
              </span> */}
              <Button
                asChild
                variant="outline"
                className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
              >
                <Link href="/library">Open Library</Link>
              </Button>
            </div>

          </div>

          {loading ? (
            <div className="mt-6 grid gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`recent-skeleton-${index}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-16 rounded-md" />
                    <div>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
              Upload your first project to get started.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {recent.map((item: ContentItem) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ImageWithSkeleton
                        src={`/api/content/${item.id}/asset?type=thumbnail`}
                        alt={`${item.title} thumbnail`}
                        className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                        wrapperClassName="h-12 w-16 rounded-md"
                      />
                      <div>
                        <div className="text-sm font-semibold">{item.title}</div>
                        <div className="text-xs text-slate-500 dark:text-zinc-500">
                          {formatDate(item.createdAt)}
                        </div>
                      </div>
                    </div>
                    {<JobStatusBadge status={getEffectiveStatus(item)} showLabel progress={renderProgress[item.id]?.progress} />}
                  </div>
                  <StatRow show={getEffectiveStatus(item) === "rendering"}>
                    <Progress
                      value={Math.round((renderProgress[item.id]?.progress ?? 0) * 100)}
                      variant="amber"
                    />
                  </StatRow>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-50">
            Render Checklist
          </h3>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                <Film className="h-4 w-4" />
              </span>
              <span>Upload a clean loopable video clip.</span>
            </li>
            <li className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_6px_14px_-10px_rgba(16,185,129,0.5)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <Music className="h-4 w-4" />
              </span>
              <span>Confirm song length in seconds.</span>
            </li>
            <li className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-[0_6px_14px_-10px_rgba(245,158,11,0.5)] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <span>Adjust fade and segment length.</span>
            </li>
            <li className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_6px_14px_-10px_rgba(59,130,246,0.5)] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                <Send className="h-4 w-4" />
              </span>
              <span>Send to render for output.</span>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
