"use client";

import { Link } from "@/components/navigation/route-transition";
import { Button } from "@/components/ui/button";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { useContentList } from "@/hooks/use-content";
import { useDashboardStats } from "@/hooks/use-dashboard";
import type { ContentItem } from "@/types";
import { useRenderProgress } from "@/hooks/use-progress";
import {
  Film,
  Music,
  SlidersHorizontal,
  Send,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { StatsDisplay } from "@/components/tool-ui/stats-display";
import { Skeleton } from "@/components/ui/skeleton";


export default function DashboardOverviewPage() {
  const { items, loading } = useContentList();
  const { data: dashboardStats, loading: statsLoading } = useDashboardStats("all");
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
  const overviewStats = [
    {
      key: "total-projects",
      label: "Total Projects",
      value: statsLoading ? "..." : dashboardStats?.totals.total ?? items.length,
      format: { kind: "number" as const },
      diff: dashboardStats?.diffs.projects,
      sparkline: dashboardStats
        ? { data: dashboardStats.trends.projects.map((point) => point.value) }
        : undefined,
    },
    {
      key: "rendered-projects",
      label: "Rendered",
      value: statsLoading ? "..." : dashboardStats?.totals.rendered ?? rendered,
      format: { kind: "number" as const },
      diff: dashboardStats?.diffs.rendered,
      sparkline: dashboardStats
        ? {
            data: dashboardStats.trends.rendered.map((point) => point.value),
            color: "rgb(16 185 129)",
          }
        : undefined,
    },
    {
      key: "failed-projects",
      label: "Failed",
      value: statsLoading ? "..." : dashboardStats?.totals.failed ?? failed,
      format: { kind: "number" as const },
      diff: dashboardStats?.diffs.failed,
      sparkline: dashboardStats
        ? {
            data: dashboardStats.trends.failed.map((point) => point.value),
            color: "rgb(244 63 94)",
          }
        : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <StatsDisplay
          id="dashboard-overview-stats"
          // title="Overview"
          // description="Snapshot of your current project pipeline."
          stats={overviewStats}
          className="max-w-none"
        />
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(420px,1fr)_minmax(280px,500px)]">
        <Card className="min-w-0 border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Recent Projects</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Latest uploads and render activity.
              </p>
            </div>

            <div className="flex shrink-0 gap-4">
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
                <Card
                  key={item.id}
                  animateHeight={false}
                  progress={getEffectiveStatus(item) === "rendering" ? Math.round((renderProgress[item.id]?.progress ?? 0) * 100) : null}
                  progressClassName="bg-black/6 ring-black/5 dark:bg-white/8 dark:ring-white/6"
                  className="min-w-0 gap-3 overflow-hidden border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
                    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                      <ImageWithSkeleton
                        src={`/api/content/${item.id}/asset?type=thumbnail`}
                        alt={`${item.title} thumbnail`}
                        className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                        wrapperClassName="h-12 w-16 rounded-md"
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="truncate text-sm font-semibold">{item.title}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-zinc-500">
                          {formatDate(item.createdAt)}
                        </div>
                      </div>
                    </div>
                    <JobStatusBadge
                      status={getEffectiveStatus(item)}
                      showLabel
                      progress={renderProgress[item.id]?.progress}
                      className="shrink-0"
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-w-0 border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-50">
            Render Checklist
          </h3>
          <ul className="mt-4 space-y-3">
            <li className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_6px_14px_-10px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                <Film className="h-4 w-4" />
              </span>
              <span className="min-w-0">Upload a clean loopable video clip.</span>
            </li>
            <li className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_6px_14px_-10px_rgba(16,185,129,0.5)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <Music className="h-4 w-4" />
              </span>
              <span className="min-w-0">Confirm song length in seconds.</span>
            </li>
            <li className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-[0_6px_14px_-10px_rgba(245,158,11,0.5)] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <span className="min-w-0">Adjust fade and segment length.</span>
            </li>
            <li className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-[0_6px_14px_-10px_rgba(59,130,246,0.5)] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                <Send className="h-4 w-4" />
              </span>
              <span className="min-w-0">Send to render for output.</span>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
