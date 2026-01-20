"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useContentList } from "./_components/use-content-list";
import {
  Activity,
  CircleCheck,
  TriangleAlert,
  Sparkles,
} from "lucide-react";

export default function DashboardOverviewPage() {
  const { items, loading } = useContentList();

  const rendered = items.filter((item) => item.status === "rendered").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const progress = items.length ? (rendered / items.length) * 100 : 0;
  const recent = items.slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap gap-3">
        <Button asChild className="bg-emerald-500 text-black hover:bg-emerald-400">
          <Link href="/dashboard/upload">Upload New</Link>
        </Button>
        <Button
          asChild
          variant="secondary"
          className="border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
        >
          <Link href="/dashboard/library">View Library</Link>
        </Button>
      </section>

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
          <div className="mt-3 text-3xl font-semibold">{items.length}</div>
          <Progress value={progress} className="mt-4" />
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
          <div className="mt-3 text-3xl font-semibold">{rendered}</div>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            {items.length ? Math.round(progress) : 0}% completion
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
          <div className="mt-3 text-3xl font-semibold">{failed}</div>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            Retry failed items from the library.
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
                <Link href="/dashboard/library">Open Library</Link>
              </Button>
            </div>

          </div>

          {loading ? (
            <div className="mt-6 text-sm text-slate-500 dark:text-zinc-400">
              Loading content...
            </div>
          ) : recent.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
              Upload your first project to get started.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {recent.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={`/api/content/${item.id}/asset?type=thumbnail`}
                      alt={`${item.title} thumbnail`}
                      className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-500">
                        {new Date(item.createdAt).toLocaleDateString()}
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
