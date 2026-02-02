"use client";

import { Activity } from "lucide-react";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { MetricsPanel } from "@/components/studio/metrics-panel";

export default function DashboardStatsPage() {
  const { metrics } = useSocketIO();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-400">
            Performance
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-zinc-50">
            Hardware Metrics
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400 dark:text-zinc-500">
          <Activity className="h-4 w-4" />
          Live feed
        </div>
      </div>

      <MetricsPanel metrics={metrics} />
    </div>
  );
}
