"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useContentList, type ContentItem } from "../_components/use-content-list";
import { useDashboardSocket } from "../_components/dashboard-socket";
import NvidiaIcon from "@/components/icons/nvidia";
import AmdIcon from "@/components/icons/amd";
import IntelIcon from "@/components/icons/intel";
import {
  Activity,
  CircleCheck,
  Cpu,
  Flame,
  MemoryStick,
  MonitorDot,
  TriangleAlert,
  Sparkles,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const { items, loading } = useContentList();
  const { metrics } = useDashboardSocket();
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value)
    );

  const rendered = items.filter((item: ContentItem) => item.status === "rendered").length;
  const failed = items.filter((item: ContentItem) => item.status === "failed").length;
  const progress = items.length ? (rendered / items.length) * 100 : 0;
  const recent = items.slice(0, 3);
  const cpuLoad = metrics?.cpu.load ?? null;
  const cpuTemp = metrics?.cpu.temperature ?? null;
  const ramUsage = metrics?.memory.usage ?? null;
  const gpus = (metrics?.gpus ?? []).filter((gpu) => {
    const utilization = gpu.utilizationGpu ?? 0;
    const vramUsage = gpu.vramUsagePct ?? 0;
    return utilization > 0 || vramUsage > 0 || gpu.temperatureGpu !== null;
  });
  const metricsReady = Boolean(metrics);

  const GpuIcon = ({
    vendor,
    model,
  }: {
    vendor: string | null;
    model: string;
  }) => {
    const label = `${vendor ?? ""} ${model}`.toLowerCase();
    switch (true) {
      case label.includes("amd"):
      case label.includes("radeon"):
        return <AmdIcon size={22} strokeWidth={0.5} padding={0} color="currentColor" />;
      case label.includes("intel"):
      case label.includes("arc"):
        return <IntelIcon size={22} strokeWidth={0.5} padding={0} color="currentColor" />;
      case label.includes("nvidia"):
        return (
          <NvidiaIcon size={22} strokeWidth={0.5} padding={0} color="currentColor" />
        );
      default:
        return <MonitorDot className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              CPU Load
            </p>
            <span className="rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300">
              <Cpu className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {metricsReady ? `${Math.round(cpuLoad ?? 0)}%` : (
              <Skeleton className="h-8 w-24" />
            )}
          </div>
          {metricsReady ? (
            <Progress value={cpuLoad ?? 0} variant="blue" className="mt-4" />
          ) : (
            <Skeleton className="mt-4 h-2 w-full" />
          )}
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              RAM Usage
            </p>
            <span className="rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300">
              <MemoryStick className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {metricsReady ? `${Math.round(ramUsage ?? 0)}%` : (
              <Skeleton className="h-8 w-24" />
            )}
          </div>
          {metricsReady ? (
            <Progress value={ramUsage ?? 0} variant="green" className="mt-4" />
          ) : (
            <Skeleton className="mt-4 h-2 w-full" />
          )}
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              CPU Temp
            </p>
            <span className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <Flame className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {metricsReady ? `${Math.round(cpuTemp ?? 0)}°C` : (
              <Skeleton className="h-8 w-20" />
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            Live CPU temperature.
          </p>
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              GPUs Online
            </p>
            <span className="rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300">
              <MonitorDot className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {metricsReady ? gpus.length : <Skeleton className="h-8 w-12" />}
          </div>
        </Card>
      </section>

      {metricsReady ? (
        <section className="grid gap-4 md:grid-cols-2">
          {gpus.map((gpu) => (
            <Card
              key={`${gpu.model}-${gpu.bus ?? "gpu"}`}
              className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
                    GPU
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-zinc-50">
                    {gpu.model}
                  </h3>
                  {/* {gpu.bus ? (
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Bus {gpu.bus}
                    </p>
                  ) : null} */}
                </div>
                <div className="flex items-center gap-2 text-right text-sm text-slate-500 dark:text-zinc-400">
                  <span>
                    {gpu.temperatureGpu !== null
                      ? `${Math.round(gpu.temperatureGpu)}°C`
                      : "--"}
                  </span>
                  <span className="rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300">
                    <GpuIcon vendor={gpu.vendor} model={gpu.model} />
                  </span>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-500 dark:text-zinc-400">
                <div>
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                    <span>Utilization</span>
                    <span>
                      {gpu.utilizationGpu !== null
                        ? `${Math.round(gpu.utilizationGpu)}%`
                        : "--"}
                    </span>
                  </div>
                  <Progress value={gpu.utilizationGpu ?? 0} variant="blue" className="mt-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                    <span>VRAM</span>
                    <span>
                      {gpu.vramUsagePct !== null
                        ? `${Math.round(gpu.vramUsagePct)}%`
                        : "--"}
                    </span>
                  </div>
                  <Progress value={gpu.vramUsagePct ?? 0} variant="violet" className="mt-2" />
                  {gpu.vramUsedMB !== null && gpu.vramTotalMB !== null ? (
                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                      {gpu.vramUsedMB}MB / {gpu.vramTotalMB}MB
                    </div>
                  ) : null}
                </div>
                {gpu.fanSpeedPct !== null && (
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                      <span>Fan</span>
                      <span>{Math.round(gpu.fanSpeedPct)}%</span>
                    </div>
                    <Progress value={gpu.fanSpeedPct} variant="default" className="mt-2" />
                  </div>
                )}
                {gpu.powerDrawW !== null && (
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                      <span>Power</span>
                      <span>
                        {Math.round(gpu.powerDrawW)}W
                        {gpu.powerLimitW !== null
                          ? ` / ${Math.round(gpu.powerLimitW)}W`
                          : ""}
                      </span>
                    </div>
                    <Progress
                      value={
                        gpu.powerLimitW
                          ? Math.min(
                              100,
                              (gpu.powerDrawW / gpu.powerLimitW) * 100
                            )
                          : 0
                      }
                      variant="amber"
                      className="mt-2"
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card
              key={`gpu-skeleton-${index}`}
              className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="mt-3 h-5 w-40" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="mt-4 space-y-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between ">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              Total Projects
            </p>
            <span className="rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {loading ? <Skeleton className="h-8 w-16" /> : items.length}
          </div>
          {loading ? (
            <Skeleton className="mt-4 h-2 w-full" />
          ) : (
            <Progress value={progress} variant="violet" className="mt-4" />
          )}
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              Rendered
            </p>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 p-2 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CircleCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {loading ? <Skeleton className="h-8 w-16" /> : rendered}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            {loading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              `${items.length ? Math.round(progress) : 0}% completion`
            )}
          </p>
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
              Failed
            </p>
            <span className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <TriangleAlert className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold">
            {loading ? <Skeleton className="h-8 w-16" /> : failed}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            {loading ? <Skeleton className="h-3 w-32" /> : "Retry failed items from the library."}
          </p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent Projects</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Latest uploads and render activity.
              </p>
            </div>

            <div className="flex gap-4">
              <span className="hidden items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 sm:flex">
                <Sparkles className="h-4 w-4" />
                Freshly synced
              </span>
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
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/content/${item.id}/asset?type=thumbnail`}
                      alt={`${item.title} thumbnail`}
                      className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-500">
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">
                    {item.status}
                  </Badge>
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
            <li>Upload a clean loopable video clip.</li>
            <li>Confirm song length in seconds.</li>
            <li>Adjust fade and segment length.</li>
            <li>Send to render for output.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
