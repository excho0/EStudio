"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SettingsStats = {
  total: number;
  uploaded: number;
  rendering: number;
  rendered: number;
  failed: number;
};

type SettingsStorage = {
  baseDir: string;
  uploadsDir: string;
  rendersDir: string;
  manifestsDir: string;
  uploadsCount: number;
  rendersCount: number;
  manifestsCount: number;
};

type SettingsResponse = {
  storage: SettingsStorage;
  stats: SettingsStats;
};

export default function DashboardSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [rescanLoading, setRescanLoading] = useState(false);
  const [data, setData] = useState<SettingsResponse | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Failed to load settings.");
      }
      const payload = (await response.json()) as SettingsResponse;
      setData(payload);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load settings."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async () => {
    setRescanLoading(true);
    try {
      const response = await fetch("/api/content/rescan", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to rescan content storage.");
      }
      const result = (await response.json()) as {
        created: number;
        skipped: number;
        errors: string[];
      };
      if (result.errors?.length) {
        toast.error(result.errors[0] ?? "Rescan completed with warnings.");
      } else {
        toast.success(
          `Rescan completed: ${result.created} restored, ${result.skipped} skipped.`
        );
      }
      await loadSettings();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rescan storage."
      );
    } finally {
      setRescanLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Storage paths, project stats, and recovery tools.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
            onClick={handleRescan}
            loading={rescanLoading}
            loadingText="Rescanning..."
          >
            Rescan storage
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-zinc-300">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
              Storage
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-zinc-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Base</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {data?.storage.baseDir ?? "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Videos</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {data?.storage.uploadsDir ?? "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Renders</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {data?.storage.rendersDir ?? "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Manifests</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {data?.storage.manifestsDir ?? "—"}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
              Filesystem-backed storage is active for this workspace.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-white/10 dark:text-zinc-300">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
              Projects
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.stats.total ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Uploaded</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.stats.uploaded ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rendering</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.stats.rendering ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rendered</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.stats.rendered ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Failed</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.stats.failed ?? 0}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Uploads folders</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.storage.uploadsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Renders</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.storage.rendersCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Manifests</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-50">
                  {loading ? "…" : data?.storage.manifestsCount ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
