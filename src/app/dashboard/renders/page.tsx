"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useContentList } from "../_components/use-content-list";

export default function DashboardRendersPage() {
  const { items, loading, refresh } = useContentList();
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRender = async (id: string) => {
    setRenderingId(id);
    setError(null);
    const response = await fetch(`/api/content/${id}/render`, { method: "POST" });

    if (!response.ok) {
      setError("Render failed. Please check server logs.");
    }

    await refresh();
    setRenderingId(null);
  };

  const active = items.filter((item) => item.status === "rendering");
  const queued = items.filter((item) => item.status === "uploaded");
  const failed = items.filter((item) => item.status === "failed");
  const rendered = items.filter((item) => item.status === "rendered");

  const sections = [
    { title: "Active", data: active },
    { title: "Queued", data: queued },
    { title: "Failed", data: failed },
    { title: "Rendered", data: rendered },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Render Queue</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Track progress and retry failed renders.
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-slate-500 dark:text-zinc-400">
            Loading renders...
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {sections.map((section) => (
              <div key={section.title} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <span className="text-xs text-slate-500 dark:text-zinc-500">
                    {section.data.length} items
                  </span>
                </div>
                {section.data.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500 dark:text-zinc-500">
                    No items in this state.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {section.data.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={`/api/content/${item.id}/asset?type=thumbnail`}
                            alt={`${item.title} thumbnail`}
                            className="h-10 w-14 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                          />
                          <div>
                            <div className="text-sm font-medium">{item.title}</div>
                            <div className="text-xs text-slate-500 dark:text-zinc-500">
                              {item.songDurationSeconds}s song / {item.segmentDurationSeconds}s segments
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">
                            {item.status}
                          </Badge>
                          {(item.status === "uploaded" || item.status === "failed") && (
                            <Button
                              size="sm"
                              className="bg-emerald-500 text-black hover:bg-emerald-400"
                              onClick={() => handleRender(item.id)}
                              disabled={renderingId === item.id}
                            >
                              {renderingId === item.id ? "Rendering..." : "Render"}
                            </Button>
                          )}
                          {item.renderPath && (
                            <a
                              href={`/api/content/${item.id}/asset?type=render`}
                              className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
