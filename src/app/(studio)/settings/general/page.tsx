"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Bell,
  FolderOpen,
  HardDrive,
  RotateCcw,
  Globe,
} from "lucide-react";
import {
  getNotificationEnabled,
  requestNotificationPermission,
  setNotificationEnabled,
} from "@/lib/notifications";

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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
    setNotificationsEnabled(getNotificationEnabled());
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
                General
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Storage paths, project stats, and recovery tools.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
            onClick={handleRescan}
            loading={rescanLoading}
            loadingText="Rescanning..."
          >
            <RotateCcw className="h-4 w-4" />
            Rescan storage
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:text-zinc-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                <HardDrive className="h-3.5 w-3.5" />
                Storage
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300">
                Local
              </span>
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

          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:text-zinc-300">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
              <FolderOpen className="h-3.5 w-3.5" />
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

        <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:text-zinc-300">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
            Get a desktop alert and sound when a render completes.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={notificationsEnabled ? "secondary" : "default"}
              onClick={async () => {
                if (notificationsEnabled) {
                  setNotificationEnabled(false);
                  setNotificationsEnabled(false);
                  toast.message("Render notifications disabled.");
                  return;
                }
                const permission = await requestNotificationPermission();
                if (permission === "granted") {
                  setNotificationEnabled(true);
                  setNotificationsEnabled(true);
                  toast.success("Render notifications enabled.");
                  return;
                }
                if (permission === "denied") {
                  toast.error("Browser notifications are blocked.");
                  return;
                }
                toast.error("Notifications not supported in this browser.");
              }}
            >
              {notificationsEnabled ? "Disable notifications" : "Enable notifications"}
            </Button>
            <span className="text-xs text-slate-500 dark:text-zinc-500">
              {typeof window === "undefined" || !("Notification" in window)
                ? "Not supported"
                : `Permission: ${Notification.permission}`}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
