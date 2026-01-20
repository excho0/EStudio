"use client";

import { Card } from "@/components/ui/card";

export default function DashboardSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
          Configure render defaults and storage details.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-zinc-300">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
              Storage
            </div>
            <div className="mt-2 font-semibold text-slate-900 dark:text-zinc-50">
              local-content/
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
              Filesystem-backed storage is active for this workspace.
            </p>
          </div>

          {/* <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-zinc-300">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
              Defaults
            </div>
            <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-zinc-500">
              <li>Resolution: 1280x720</li>
              <li>FPS: 30</li>
              <li>Segment length: 4s</li>
              <li>Fade: 1s</li>
            </ul>
          </div> */}
        </div>
      </Card>
    </div>
  );
}
