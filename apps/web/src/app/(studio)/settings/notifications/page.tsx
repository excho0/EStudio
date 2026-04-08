"use client";
import {
  Bell,
  ChevronRight,
  Clapperboard,
  FileText,
  FolderKanban,
  Monitor,
  Send,
  Smartphone,
  Tablet,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";
import { useNotificationPreferences } from "@/hooks/use-notifications";

type NotificationLeafKey = "render" | "publish" | "caption";
type NotificationRegistryNode =
  | {
      type: "group";
      key: string;
      title: string;
      description: string;
      icon: React.ComponentType<{ className?: string }>;
      children: NotificationRegistryNode[];
    }
  | {
      type: "item";
      key: NotificationLeafKey;
      title: string;
      description: string;
      icon: React.ComponentType<{ className?: string }>;
    };

const notificationRegistry: NotificationRegistryNode[] = [
  {
    type: "group",
    key: "content",
    title: "Content updates",
    description: "Master switch for render, caption, and publish notifications.",
    icon: FolderKanban,
    children: [
      {
        type: "item",
        key: "render",
        title: "Renders",
        description: "Finished, failed, or canceled render jobs.",
        icon: Clapperboard,
      },
      {
        type: "item",
        key: "publish",
        title: "Publishes",
        description: "Publishing progress outcomes for connected platforms.",
        icon: Send,
      },
      {
        type: "item",
        key: "caption",
        title: "Captions",
        description: "Caption generation completion and failure updates.",
        icon: FileText,
      },
    ],
  },
];

const depthPaddingClassName = (depth: number) => {
  if (depth <= 0) return "pl-1";
  if (depth === 1) return "pl-4";
  if (depth === 2) return "pl-7";
  return "pl-10";
};

export default function NotificationsSettingsPage() {
  const {
    preferences,
    loading,
    deviceSubscribed,
    deviceBusy,
    groupBusy,
    savingCategory,
    isWebPushSupported,
    toggleDeviceSubscription,
    toggleCategory,
    toggleContentGroup,
  } = useNotificationPreferences();

  const permissionLabel = (() => {
    if (!isWebPushSupported) return "Web Push not supported";
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "Notifications unavailable";
    }
    return `Permission: ${Notification.permission}`;
  })();

  const handleToggleDeviceSubscription = async (checked: boolean) => {
    try {
      const result = await toggleDeviceSubscription(checked);
      toast[checked ? "success" : "message"](result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update device subscription."
      );
    }
  };

  const handleToggleCategory = async (key: NotificationLeafKey, enabled: boolean) => {
    try {
      await toggleCategory(key, enabled);
    } catch {
      toast.error("Failed to update notification preference.");
    }
  };

  const handleToggleContentGroup = async (enabled: boolean) => {
    try {
      await toggleContentGroup(enabled);
    } catch {
      toast.error("Failed to update notification group.");
    }
  };

  const renderRegistryNode = (node: NotificationRegistryNode, depth = 0) => {
    if (node.type === "item") {
      const Icon = node.icon;
      const checked = preferences.push.groups.content.items[node.key]?.enabled ?? true;
      return (
        <div
          key={node.key}
          className={cn(
            "flex items-center justify-between gap-3 px-2 py-4",
            depthPaddingClassName(depth)
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                {node.title}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                {node.description}
              </p>
            </div>
          </div>
          <Switch
            checked={checked}
            className="my-auto shrink-0"
            disabled={
              loading ||
              !deviceSubscribed ||
              groupBusy ||
              !preferences.push.groups.content.enabled ||
              savingCategory === node.key
            }
            loading={savingCategory === node.key}
            onCheckedChange={(next) => void handleToggleCategory(node.key, next)}
          />
        </div>
      );
    }

    const Icon = node.icon;
    const groupChecked = preferences.push.groups.content.enabled;
    return (
      <Collapsible
        key={node.key}
        defaultOpen
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-3 px-2 py-4 sm:px-5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex min-w-0 flex-1 items-start justify-between gap-3 rounded-xl px-2 py-1 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                    {node.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                    {node.description}
                  </p>
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-90 sm:mt-0" />
            </button>
          </CollapsibleTrigger>
          <div className="my-auto flex shrink-0 items-center gap-3">
            <Switch
              checked={groupChecked}
              className="my-auto shrink-0"
              disabled={loading || groupBusy || !deviceSubscribed}
              loading={groupBusy}
              onCheckedChange={(checked) => void handleToggleContentGroup(checked)}
            />
          </div>
        </div>
        <CollapsibleContent className="gap-0 border-t border-slate-200 dark:border-white/10">
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {node.children.map((child) => renderRegistryNode(child, depth + 1))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Notifications
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Choose which updates you want to receive and whether this device can show push notifications.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="min-w-0 flex flex-1 items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-zinc-200">
                <Smartphone className="h-4 w-4 sm:hidden" />
                <Tablet className="hidden h-4 w-4 sm:block lg:hidden" />
                <Monitor className="hidden h-4 w-4 lg:block" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                  This device
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Turn push notifications on or off for this browser or installed app.
                </p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                  {permissionLabel}
                </p>
              </div>
            </div>
            <Switch
              checked={deviceSubscribed}
              className="my-auto shrink-0"
              disabled={loading || deviceBusy || !isWebPushSupported}
              loading={deviceBusy}
              onCheckedChange={(checked) => void handleToggleDeviceSubscription(checked)}
            />
          </div>

          <div className="space-y-3">
            {notificationRegistry.map((node) => renderRegistryNode(node))}
          </div>

          <p className="px-1 text-xs text-slate-500 dark:text-zinc-500">
            {deviceSubscribed
              ? "This device is currently subscribed for background Web Push delivery."
              : "Enable the device switch above if you want this browser or PWA to receive pushes."}
          </p>
        </div>
      </Card>
    </div>
  );
}
