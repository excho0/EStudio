"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getNotificationEnabled,
  requestNotificationPermission,
  setNotificationEnabled,
} from "@/lib/notifications";

export default function NotificationsSettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    getNotificationEnabled()
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Notifications
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Configure desktop alerts and completion sounds for background jobs.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:text-zinc-300">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
            <Bell className="h-3.5 w-3.5" />
            Desktop Alerts
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
            Get a desktop alert and sound when a render, publish, or caption job completes.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={notificationsEnabled ? "secondary" : "default"}
              onClick={async () => {
                if (notificationsEnabled) {
                  setNotificationEnabled(false);
                  setNotificationsEnabled(false);
                  toast.message("Notifications disabled.");
                  return;
                }
                const permission = await requestNotificationPermission();
                if (permission === "granted") {
                  setNotificationEnabled(true);
                  setNotificationsEnabled(true);
                  toast.success("Notifications enabled.");
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

