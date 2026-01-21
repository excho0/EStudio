"use client";

import { AnimatePresence } from "framer-motion";
import {
  Activity,
  Cpu,
  Flame,
  MemoryStick,
  MonitorDot,
  Thermometer,
  Wind,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatRow } from "@/components/ui/stat-row";
import NvidiaIcon from "@/components/icons/nvidia";
import AmdIcon from "@/components/icons/amd";
import IntelIcon from "@/components/icons/intel";
import { cn } from "@/lib/utils";
import type { MetricsPayload } from "./dashboard-socket";

const TEMP_THRESHOLDS = {
  low: 50,
  mid: 70,
  high: 80,
} as const;

type TempVariant = "default" | "blue" | "amber" | "rose";

const tempVariant = (temp: number | null): TempVariant => {
  if (temp === null) return "default";
  if (temp < TEMP_THRESHOLDS.low) return "blue";
  if (temp < TEMP_THRESHOLDS.high) return "amber";
  return "rose";
};

const TEMP_CLASSES: Record<TempVariant, string> = {
  default:
    "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-500/30 dark:bg-gray-500/10 dark:text-gray-300",
  blue:
    "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  rose:
    "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
};

const tempChipClass = (temp: number | null) => {
  const variant = tempVariant(temp);
  return cn("border", TEMP_CLASSES[variant]);
};

const CardHeaderRow = ({
  label,
  icon,
  iconClassName,
}: {
  label: string;
  icon: React.ReactNode;
  iconClassName?: string;
}) => (
  <div className="flex items-center justify-between">
    <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">
      {label}
    </p>
    <span
      className={cn(
        "rounded-full border border-slate-200 p-2 text-slate-600 dark:border-white/10 dark:text-zinc-300",
        iconClassName
      )}
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
  value: React.ReactNode;
  skeletonClassName: string;
}) => (
  <div className="mt-3 text-3xl font-semibold">
    {loading ? <Skeleton className={skeletonClassName} /> : value}
  </div>
);

const ProgressWithSkeleton = ({
  loading,
  value,
  variant,
}: {
  loading: boolean;
  value: number;
  variant: "blue" | "green" | "amber" | "rose" | "violet" | "default";
}) =>
  loading ? (
    <Skeleton className="mt-4 h-2 w-full" />
  ) : (
    <Progress value={value} variant={variant} className="mt-4" />
  );

const TempProgress = ({ temp, className }: { temp: number | null; className?: string }) => (
  <Progress
    value={temp !== null ? Math.min(100, temp) : 0}
    variant={tempVariant(temp)}
    className={cn("mt-2", className)}
  />
);

const GpuMetricLabel = ({
  icon,
  label,
  value,
  chipClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  chipClassName?: string;
}) => (
  <div className="flex items-center justify-between text-xs m-0.5 uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_6px_10px_-8px_rgba(15,23,42,0.35)] dark:bg-white/10 dark:text-zinc-200 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_16px_-12px_rgba(0,0,0,0.5)] [&>svg]:h-5 [&>svg]:w-5",
          chipClassName
        )}
      >
        {icon}
      </span>
      {label}
    </span>
    <span>{value}</span>
  </div>
);

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

export function MetricsPanel({ metrics }: { metrics: MetricsPayload | null }) {
  const cpuLoad = metrics?.cpu.load ?? null;
  const cpuTemp = metrics?.cpu.temperature ?? null;
  const ramUsage = metrics?.memory.usage ?? null;
  const gpus = (metrics?.gpus ?? []).filter((gpu) => {
    const utilization = gpu.utilizationGpu ?? 0;
    const vramUsage = gpu.vramUsagePct ?? 0;
    return utilization > 0 || vramUsage > 0 || gpu.temperatureGpu !== null;
  });
  const metricsReady = Boolean(metrics);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow label="CPU Load" icon={<Cpu className="h-4 w-4" />} />
          <ValueWithSkeleton
            loading={!metricsReady}
            value={`${Math.round(cpuLoad ?? 0)}%`}
            skeletonClassName="h-8 w-24"
          />
          <ProgressWithSkeleton
            loading={!metricsReady}
            value={cpuLoad ?? 0}
            variant="blue"
          />
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow label="RAM Usage" icon={<MemoryStick className="h-4 w-4" />} />
          <ValueWithSkeleton
            loading={!metricsReady}
            value={`${Math.round(ramUsage ?? 0)}%`}
            skeletonClassName="h-8 w-24"
          />
          <ProgressWithSkeleton
            loading={!metricsReady}
            value={ramUsage ?? 0}
            variant="green"
          />
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow
            label="CPU Temp"
            icon={<Thermometer className="h-4 w-4" />}
            iconClassName={tempChipClass(cpuTemp)}
          />
          <ValueWithSkeleton
            loading={!metricsReady}
            value={`${Math.round(cpuTemp ?? 0)}°C`}
            skeletonClassName="h-8 w-20"
          />
          {metricsReady ? (
            <TempProgress temp={cpuTemp} className="mt-4" />
          ) : (
            <Skeleton className="mt-4 h-2 w-full" />
          )}
        </Card>
        <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <CardHeaderRow
            label="GPUs Online"
            icon={<MonitorDot className="h-4 w-4" />}
          />
          <ValueWithSkeleton
            loading={!metricsReady}
            value={gpus.length}
            skeletonClassName="h-8 w-12"
          />
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
                <StatRow>
                  <GpuMetricLabel
                    icon={<Activity className="h-4 w-4" />}
                    label="Utilization"
                    value={
                      gpu.utilizationGpu !== null
                        ? `${Math.round(gpu.utilizationGpu)}%`
                        : "--"
                    }
                  />
                  <Progress value={gpu.utilizationGpu ?? 0} variant="blue" className="mt-2" />
                </StatRow>
                {gpu.temperatureGpu !== null && (
                  <StatRow>
                    <GpuMetricLabel
                      icon={<Thermometer className="h-4 w-4" />}
                      label="Temp"
                      value={`${Math.round(gpu.temperatureGpu)}°C`}
                      chipClassName={tempChipClass(gpu.temperatureGpu)}
                    />
                    <TempProgress temp={gpu.temperatureGpu} />
                  </StatRow>
                )}
                <StatRow>
                  <GpuMetricLabel
                    icon={<MemoryStick className="h-4 w-4" />}
                    label="VRAM"
                    value={
                      gpu.vramUsagePct !== null
                        ? `${Math.round(gpu.vramUsagePct)}%`
                        : "--"
                    }
                  />
                  <Progress value={gpu.vramUsagePct ?? 0} variant="violet" className="mt-2" />
                  {gpu.vramUsedMB !== null && gpu.vramTotalMB !== null ? (
                    <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                      {gpu.vramUsedMB}MB / {gpu.vramTotalMB}MB
                    </div>
                  ) : null}
                </StatRow>
                <AnimatePresence initial={false}>
                  {gpu.fanSpeedPct !== null && gpu.fanSpeedPct > 0 ? (
                    <StatRow key="fan-speed">
                      {(() => {
                        const fanValue = Math.round(gpu.fanSpeedPct ?? 0);
                        return (
                          <>
                            <GpuMetricLabel
                              icon={<Wind className="h-4 w-4" />}
                              label="Fan"
                              value={`${fanValue}%`}
                            />
                            <Progress value={fanValue} variant="default" className="mt-2" />
                          </>
                        );
                      })()}
                    </StatRow>
                  ) : null}
                </AnimatePresence>
                {gpu.powerDrawW !== null && (
                  <StatRow>
                    <GpuMetricLabel
                      icon={<Flame className="h-4 w-4" />}
                      label="Power"
                      value={`${Math.round(gpu.powerDrawW)}W${gpu.powerLimitW !== null
                        ? ` / ${Math.round(gpu.powerLimitW)}W`
                        : ""}`}
                    />
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
                  </StatRow>
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
    </>
  );
}
