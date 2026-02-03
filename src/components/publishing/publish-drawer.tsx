"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarClock,
  CheckCircle2,
  Film,
  Globe,
  Link2,
  Lock,
  PencilLine,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

import { getProviderDefinition } from "@/lib/publishing/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectableCard } from "@/components/ui/selectable-card";
import DatePickerStandard2 from "@/components/controls/date-picker-standard-2";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
  ResponsiveDrawerTrigger,
} from "@/components/ui/responsive-drawer";
import {
  StepperContent,
  StepperFooter,
  StepperHeader,
  StepperMotion,
  StepperShell,
} from "@/components/controls/animated-stepper";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchJson } from "@/lib/fetch-json";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { Link } from "@/components/navigation/route-transition";

type PublishTarget = {
  id: string;
  label: string;
  status?: string;
};

type RenderItem = {
  name: string;
  assetUrl: string;
  size: number;
  mtimeMs: number;
};

type ProviderState = {
  id: string;
  label: string;
  status?: string;
  connected: boolean;
  channel?: { title: string | null; thumbnail: string | null } | null;
  capabilities?: {
    supportsSchedule?: boolean;
    supportsPrivacy?: boolean;
    privacyOptions?: Array<"public" | "unlisted" | "private">;
    supportsTags?: boolean;
    supportsCategories?: boolean;
  };
};

type PublishDrawerProps = {
  contentId: string;
  trigger?: React.ReactNode;
  onPublished?: (publishId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const steps = [
  { id: "provider", label: "Provider", icon: Link2 },
  { id: "render", label: "Render", icon: Film },
  { id: "details", label: "Details", icon: PencilLine },
  { id: "options", label: "Options", icon: ShieldCheck },
  { id: "review", label: "Review", icon: CheckCircle2 },
];

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
};

const SelectableCardSkeletons = ({
  count = 2,
}: {
  count?: number;
}) => (
  <motion.div
    key="card-skeletons"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="grid w-full gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]"
  >
    {Array.from({ length: count }).map((_, index) => (
      <Card
        key={`card-skeleton-${index}`}
        className="rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-white/10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </Card>
    ))}
  </motion.div>
);

export function PublishDrawer({
  contentId,
  trigger,
  onPublished,
  open: controlledOpen,
  onOpenChange,
}: PublishDrawerProps) {
  const { status } = useSession();
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [stepId, setStepId] = useState(steps[0].id);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedRender, setSelectedRender] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentTitle, setContentTitle] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailCacheBust, setThumbnailCacheBust] = useState<number | null>(
    null
  );
  const [visibility, setVisibility] = useState<
    "public" | "unlisted" | "private" | "scheduled"
  >("private");
  const [scheduleAt, setScheduleAt] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [activePublishId, setActivePublishId] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [publishStage, setPublishStage] = useState<string | null>(null);
  const [publishProgress, setPublishProgress] = useState<number | null>(null);
  const [publishBytes, setPublishBytes] = useState<{
    uploaded?: number;
    total?: number;
  } | null>(null);
  const renderScrollRef = useRef<HTMLDivElement | null>(null);
  const { socket } = useSocketIO();
  const canLoadData = open && status === "authenticated" && Boolean(contentId);

  const publishTargetsQuery = useQuery<ProviderState[]>({
    queryKey: queryKeys.publishProviders,
    enabled: canLoadData,
    staleTime: 60_000,
    queryFn: async () => {
      const payload = await fetchJson<{
        publishTargets?: Array<
          PublishTarget & { connected?: boolean; channel?: ProviderState["channel"] }
        >;
      }>("/api/publish/providers", undefined, "Unable to load publish targets.");
      const publishTargets = payload.publishTargets ?? [];
      return publishTargets.map((target) => ({
        ...target,
        connected: Boolean(target.connected),
        channel: target.channel ?? null,
      }));
    },
  });

  const providerDetailQueries = useQueries({
    queries: (publishTargetsQuery.data ?? []).map((target) => {
      const definition = getProviderDefinition(target.id);
      const endpoint = definition?.connectionEndpoint;
      return {
        queryKey: queryKeys.publishProvider(target.id),
        enabled: canLoadData && Boolean(endpoint),
        staleTime: 60_000,
        queryFn: async () => {
          if (!endpoint) return null;
          return fetchJson<{
            connected: boolean;
            channel?: { title: string | null; thumbnail: string | null };
          }>(endpoint, undefined, "Unable to load provider connection.");
        },
      };
    }),
  });

  const targets = useMemo(() => {
    const base = publishTargetsQuery.data ?? [];
    if (providerDetailQueries.length === 0) return base;
    return base.map((target, index) => {
      const detail = providerDetailQueries[index]?.data;
      if (!detail) return target;
      return {
        ...target,
        connected: detail.connected,
        channel: detail.channel ?? null,
        status: detail.connected ? "active" : target.status,
      };
    });
  }, [publishTargetsQuery.data, providerDetailQueries]);

  const selectedProviderData = useMemo(
    () => targets.find((target) => target.id === selectedProvider) ?? null,
    [targets, selectedProvider]
  );

  const contentSummaryQuery = useQuery<{ title?: string; thumbnailUrl: string }>({
    queryKey: queryKeys.contentSummary(contentId),
    enabled: canLoadData,
    staleTime: 30_000,
    queryFn: async () => {
      const payload = await fetchJson<{ title?: string }>(
        `/api/content/${contentId}`,
        undefined,
        "Unable to load content summary."
      );
      return {
        title: payload.title,
        thumbnailUrl: `/api/content/${contentId}/asset?type=thumbnail`,
      };
    },
  });

  const rendersQuery = useQuery<RenderItem[]>({
    queryKey: queryKeys.contentRendersSimple(contentId),
    enabled: canLoadData,
    staleTime: 15_000,
    queryFn: async () => {
      const payload = await fetchJson<{ items?: RenderItem[] }>(
        `/api/content/${contentId}/renders?limit=50`,
        undefined,
        "Unable to load renders."
      );
      return payload.items ?? [];
    },
  });

  const renders = rendersQuery.data ?? [];
  const loading = publishTargetsQuery.isLoading || publishTargetsQuery.isFetching;
  const rendersLoading = rendersQuery.isLoading || rendersQuery.isFetching;
  const renderVirtualizer = useVirtualizer({
    count: renders.length,
    getScrollElement: () => renderScrollRef.current,
    estimateSize: () => (isMobile ? 120 : 88),
    overscan: 8,
    getItemKey: (index) => renders[index]?.name ?? index,
  });

  const canContinueProvider = Boolean(
    selectedProvider &&
      selectedProviderData?.connected &&
      selectedProviderData.status !== "coming_soon"
  );
  const canContinueRender = Boolean(selectedRender);
  const canContinueDetails = title.trim().length > 0;
  const canContinueOptions =
    !(
      selectedProviderData?.capabilities?.supportsSchedule &&
      visibility === "scheduled" &&
      !scheduleAt
    );

  const activeStepIndex = steps.findIndex((step) => step.id === stepId);

  const resetState = () => {
    setStepId(steps[0].id);
    setSelectedProvider(null);
    setSelectedRender(null);
    setTitle("");
    setDescription("");
    setContentTitle(null);
    setThumbnailUrl(null);
    setThumbnailCacheBust(null);
    setVisibility("private");
    setScheduleAt(undefined);
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProvider || !selectedRender || !canContinueDetails) {
        throw new Error("Missing publish details.");
      }
      const scheduleEnabled =
        selectedProviderData?.capabilities?.supportsSchedule &&
        visibility === "scheduled";
      const scheduleValue = scheduleEnabled ? scheduleAt?.toISOString() : null;
      const privacyValue = visibility === "scheduled" ? "private" : visibility;
      const payload = await fetchJson<{ publish?: { id?: string } }>(
        `/api/content/${contentId}/publishes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            renderId: selectedRender,
            connectionId: selectedProvider,
            providerAssetId: `pending-${crypto.randomUUID()}`,
            status: "draft",
            metadata: {
              title: title.trim(),
              description: description.trim(),
              options: {
                privacy: selectedProviderData?.capabilities?.supportsPrivacy
                  ? privacyValue
                  : undefined,
                scheduleAt: scheduleValue || undefined,
              },
              thumbnailUrl: thumbnailUrl ?? undefined,
            },
          }),
        },
        "Unable to create publish."
      );
      return payload.publish?.id ?? null;
    },
  });

  const openDrawer = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
      setActivePublishId(null);
      setPublishStatus(null);
      setPublishStage(null);
      setPublishProgress(null);
      setPublishBytes(null);
    }
  };

  useEffect(() => {
    if (!socket) return;
    if (!activePublishId) return;
    const handleProgress = (payload: {
      id: string;
      stage?: string;
      progress?: number;
      bytesUploaded?: number;
      bytesTotal?: number;
    }) => {
      if (payload.id !== activePublishId) return;
      setPublishStage(payload.stage ?? null);
      setPublishProgress(
        typeof payload.progress === "number" ? payload.progress : null
      );
      setPublishBytes({
        uploaded: payload.bytesUploaded,
        total: payload.bytesTotal,
      });
    };
    const handleUpdate = (payload: {
      id: string;
      status?: string;
      providerAssetId?: string;
      error?: string;
    }) => {
      if (payload.id !== activePublishId) return;
      if (payload.status) {
        setPublishStatus(payload.status);
      }
    };
    socket.on("publish:progress", handleProgress);
    socket.on("publish:update", handleUpdate);
    return () => {
      socket.off("publish:progress", handleProgress);
      socket.off("publish:update", handleUpdate);
    };
  }, [socket, activePublishId]);

  useEffect(() => {
    if (!open) return;
    if (!contentSummaryQuery.data?.title) return;
    setContentTitle(contentSummaryQuery.data.title ?? null);
    setTitle((current) =>
      current.trim().length === 0 ? contentSummaryQuery.data?.title ?? "" : current
    );
  }, [contentSummaryQuery.data?.title, open]);

  useEffect(() => {
    if (!open) return;
    if (!contentSummaryQuery.data?.thumbnailUrl) return;
    setThumbnailUrl(contentSummaryQuery.data.thumbnailUrl);
    setThumbnailCacheBust(Date.now());
  }, [contentSummaryQuery.data?.thumbnailUrl, open]);

  useEffect(() => {
    if (!open) return;
    if (publishTargetsQuery.error) {
      toast.error(
        publishTargetsQuery.error instanceof Error
          ? publishTargetsQuery.error.message
          : "Unable to load publish targets."
      );
    }
  }, [open, publishTargetsQuery.error]);

  useEffect(() => {
    if (!open) return;
    if (rendersQuery.error) {
      toast.error(
        rendersQuery.error instanceof Error
          ? rendersQuery.error.message
          : "Unable to load renders."
      );
    }
  }, [open, rendersQuery.error]);

  useEffect(() => {
    if (!open) return;
    if (contentSummaryQuery.error) {
      toast.error(
        contentSummaryQuery.error instanceof Error
          ? contentSummaryQuery.error.message
          : "Unable to load content summary."
      );
    }
  }, [open, contentSummaryQuery.error]);

  const handleNext = () => {
    if (stepId === "provider" && !canContinueProvider) return;
    if (stepId === "render" && !canContinueRender) return;
    if (stepId === "details" && !canContinueDetails) return;
    if (stepId === "options" && !canContinueOptions) return;
    const next = steps[Math.min(activeStepIndex + 1, steps.length - 1)]?.id;
    if (next) setStepId(next);
  };

  const handleBack = () => {
    const prev = steps[Math.max(activeStepIndex - 1, 0)]?.id;
    if (prev) setStepId(prev);
  };

  const handlePublish = async () => {
    if (!selectedProvider || !selectedRender || !canContinueDetails) return;
    setSubmitting(true);
    try {
      const publishId = await publishMutation.mutateAsync();
      toast.success("Publish draft created.");
      if (publishId) {
        setActivePublishId(publishId);
        setPublishStatus("queued");
        onPublished?.(publishId);
      }
      openDrawer(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to publish."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!contentId) {
    return null;
  }

  return (
    <ResponsiveDrawer open={open} onOpenChange={openDrawer}>
      {trigger ? (
        <ResponsiveDrawerTrigger asChild>{trigger}</ResponsiveDrawerTrigger>
      ) : null}
      <ResponsiveDrawerContent
        className="w-full sm:max-w-4xl overflow-hidden"
        closeOnOutsideClick={false}
        data-publish-status={publishStatus ?? undefined}
        data-publish-stage={publishStage ?? undefined}
        data-publish-progress={
          typeof publishProgress === "number"
            ? publishProgress.toFixed(3)
            : undefined
        }
        data-publish-bytes={
          publishBytes
            ? `${publishBytes.uploaded ?? 0}/${publishBytes.total ?? 0}`
            : undefined
        }
      >
        <ResponsiveDrawerHeader>
          <ResponsiveDrawerTitle className="text-xl">
            Publish
          </ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            Pick a destination, choose a render, then add your metadata.
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {status === "unauthenticated" ? (
            <Card className="mt-6 border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
              Sign in to manage publish destinations.
            </Card>
          ) : (
            <StepperShell
              steps={steps}
              currentId={stepId}
              isComplete={false}
              onStepClick={(id) => setStepId(id)}
              validate={(id) => {
                if (id === "render") return canContinueProvider;
                if (id === "details") return canContinueProvider && canContinueRender;
                if (id === "options")
                  return canContinueProvider && canContinueRender && canContinueDetails;
                if (id === "review")
                  return (
                    canContinueProvider &&
                    canContinueRender &&
                    canContinueDetails &&
                    canContinueOptions
                  );
                return true;
              }}
            >
              <StepperHeader />
              <StepperContent>
                {({ direction }) => (
                  <StepperMotion
                    stepKey={stepId}
                    direction={direction}
                    className="space-y-4"
                  >
                    {stepId === "provider" && (
                      <div className="space-y-4">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={loading ? "provider-loading" : "provider-loaded"}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-4"
                          >
                            {loading ? (
                              <SelectableCardSkeletons count={2} />
                            ) : targets.length === 0 ? (
                              <Card className="p-4 text-sm text-muted-foreground">
                                No publish targets are available yet.
                              </Card>
                            ) : (
                              <div className="grid w-full gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                                {targets.map((target) => {
                                  const isSelected = target.id === selectedProvider;
                                  const isConnected = target.connected;
                                  const isComingSoon =
                                    target.status === "coming_soon" && !target.connected;
                                  const providerDefinition = getProviderDefinition(
                                    target.id
                                  );
                                  const ProviderIcon = providerDefinition?.icon;
                                  const providerLabel =
                                    providerDefinition?.label ?? target.label;
                                  const channelTitle =
                                    target.channel?.title ?? providerLabel;
                                  const showChannelAvatar =
                                    isConnected && Boolean(target.channel?.thumbnail);
                                  const statusLabel = isComingSoon
                                    ? "Coming soon"
                                    : isConnected
                                      ? "Connected"
                                      : "Not linked";
                                  return (
                                    <SelectableCard
                                      key={target.id}
                                      selected={isSelected}
                                      disabled={isComingSoon}
                                      onClick={() => {
                                        if (isComingSoon) return;
                                        setSelectedProvider(target.id);
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
                                          {showChannelAvatar ? (
                                            <ImageWithSkeleton
                                              src={target.channel?.thumbnail ?? ""}
                                              alt={channelTitle}
                                              className="h-10 w-10 rounded-full object-cover"
                                              wrapperClassName="h-10 w-10 rounded-full"
                                            />
                                          ) : ProviderIcon ? (
                                            <ProviderIcon className="h-5 w-5" />
                                          ) : (
                                            <span className="text-xs font-semibold">
                                              {providerLabel.slice(0, 2).toUpperCase()}
                                            </span>
                                          )}
                                        </span>
                                        <div className="flex-1 space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                              {channelTitle}
                                            </p>
                                            <Badge
                                              variant={
                                                providerDefinition?.badgeVariant ?? "outline"
                                              }
                                            >
                                              {ProviderIcon ? (
                                                <ProviderIcon className="h-3 w-3 shrink-0" />
                                              ) : null}
                                              {providerLabel}
                                            </Badge>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={` text-xs font-[15px]  `}
                                            >
                                              {statusLabel}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </SelectableCard>
                                  );
                                })}
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>

                        <Card className="border-dashed border-slate-200 p-4 text-sm text-muted-foreground dark:border-white/10 justify-center">
                          <div className="flex justify-center items-center gap-2">
                            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
                              <Wrench className="h-5 w-5 shrink-0 flex" />
                            </span>
                            <div>
                              <span>Manage providers in</span>{" "}
                              <Button
                                asChild
                                variant="link"
                                className="font-semibold text-primary p-0"
                              >
                                <Link onClick={() => setOpen(false)} href="/settings/connections">
                                  Connections
                                </Link>
                              </Button>
                              .
                            </div>
                          </div>
                        </Card>
                      </div>
                    )}

                    {stepId === "render" && (
                      <div className="space-y-4">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={rendersLoading ? "render-loading" : "render-loaded"}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-4"
                          >
                            {rendersLoading ? (
                              <SelectableCardSkeletons count={2} />
                            ) : renders.length === 0 ? (
                              <Card className="p-4 text-sm text-muted-foreground">
                                No renders available yet.
                              </Card>
                            ) : (
                              <div
                                ref={renderScrollRef}
                                className="h-[20svh] overflow-y-auto pr-2"
                              >
                                <div
                                  className="relative w-full"
                                  style={{
                                    height: `${renderVirtualizer.getTotalSize()}px`,
                                  }}
                                >
                                  {renderVirtualizer.getVirtualItems().map((row) => {
                                    const render = renders[row.index];
                                    if (!render) return null;
                                    const isSelected =
                                      render.name === selectedRender;
                                    return (
                                      <div
                                        key={row.key}
                                        className="absolute left-0 top-0 w-full"
                                        style={{
                                          transform: `translateY(${row.start}px)`,
                                        }}
                                      >
                                        <div className="pb-4">
                                          <SelectableCard
                                            selected={isSelected}
                                            onClick={() =>
                                              setSelectedRender(render.name)
                                            }
                                          >
                                            <div>
                                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {render.name}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatBytes(render.size)}
                                              </p>
                                            </div>
                                          </SelectableCard>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    )}

                    {stepId === "details" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-900 dark:text-white">
                            Title
                          </label>
                          <Input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Give your video a catchy title"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-900 dark:text-white">
                            Thumbnail
                          </label>
                          <Card className="flex p-3">

                            <div className="flex w-full gap-4">
                              {thumbnailUrl ? (
                                <ImageWithSkeleton
                                  src={
                                    thumbnailCacheBust
                                      ? `${thumbnailUrl}&v=${thumbnailCacheBust}`
                                      : thumbnailUrl
                                  }
                                  alt={contentTitle ?? "Content thumbnail"}
                                  className="h-16 w-28 rounded-md object-cover"
                                  wrapperClassName="h-16 w-28 rounded-md shrink-0"
                                />
                              ) : (
                                <div className="h-16 w-28 shrink-0 rounded-md bg-muted" />
                              )}
                              <div className="flex flex-col justify-center">
                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                  Using content thumbnail
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Derived from the main content item.
                                </p>
                              </div>

                            </div>
                          </Card>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-900 dark:text-white">
                            Description
                          </label>
                          <Textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Add a short description (optional)"
                            rows={4}
                          />
                        </div>
                      </div>
                    )}

                    {stepId === "options" && (
                      <div className="space-y-4">
                        {selectedProviderData?.capabilities?.supportsPrivacy ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-900 dark:text-white">
                              Visibility
                            </label>
                            <Select
                              value={visibility}
                              onValueChange={(value) =>
                                setVisibility(
                                  value as "public" | "unlisted" | "private" | "scheduled"
                                )
                              }
                            >
                              {(() => {
                                const icon =
                                  visibility === "public"
                                    ? Globe
                                    : visibility === "unlisted"
                                      ? Link2
                                      : visibility === "private"
                                        ? Lock
                                        : CalendarClock;
                                const label =
                                  visibility === "public"
                                    ? "Public"
                                    : visibility === "unlisted"
                                      ? "Unlisted"
                                      : visibility === "private"
                                        ? "Private"
                                        : "Scheduled";
                                const Icon = icon;
                                return (
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select visibility">
                                      <span className="inline-flex items-center gap-2">
                                        <Icon className="h-4 w-4" />
                                        {label}
                                      </span>
                                    </SelectValue>
                                  </SelectTrigger>
                                );
                              })()}
                              <SelectContent>
                                {(selectedProviderData.capabilities.privacyOptions ??
                                  ["public", "unlisted", "private"]
                                ).map((option) => (
                                  <SelectItem
                                    key={option}
                                    value={option}
                                    icon={
                                      option === "public" ? (
                                        <Globe className="h-4 w-4" />
                                      ) : option === "unlisted" ? (
                                        <Link2 className="h-4 w-4" />
                                      ) : (
                                        <Lock className="h-4 w-4" />
                                      )
                                    }
                                  >
                                    {option[0]!.toUpperCase() + option.slice(1)}
                                  </SelectItem>
                                ))}
                                {selectedProviderData.capabilities.supportsSchedule ? (
                                  <SelectItem
                                    value="scheduled"
                                    icon={<CalendarClock className="h-4 w-4" />}
                                  >
                                    Scheduled
                                  </SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}

                        <AnimatePresence mode="wait">
                          {selectedProviderData?.capabilities?.supportsSchedule &&
                          visibility === "scheduled" ? (
                            <motion.div
                              key="schedule-picker"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className=""
                            >
                              <div className="space-y-2 flex flex-col gap-0.5 overflow-hidden pt-2">
                                <label className="text-sm font-medium text-slate-900 dark:text-white">
                                  Publish date
                                </label>
                                <DatePickerStandard2
                                  value={scheduleAt}
                                  onChange={setScheduleAt}
                                />
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    )}

                    {stepId === "review" && (
                      <div className="space-y-4">
                        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
                          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-6">
                            <div className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5 sm:w-48">
                              {thumbnailUrl ? (
                                <ImageWithSkeleton
                                  src={`${thumbnailUrl}${thumbnailCacheBust ? `&v=${thumbnailCacheBust}` : ""}`}
                                  alt={contentTitle ?? title}
                                  className="h-full w-full object-cover"
                                  wrapperClassName="aspect-video w-full"
                                />
                              ) : (
                                <div className="aspect-video w-full bg-slate-100 dark:bg-white/5" />
                              )}
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                    Review & Publish
                                  </p>
                                  <p className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
                                    {title.trim() || contentTitle || "Untitled video"}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="flex items-center gap-1.5 border-slate-200 text-xs text-slate-700 dark:border-white/10 dark:text-slate-200"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Ready
                                </Badge>
                              </div>
                              <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    <Link2 className="h-3.5 w-3.5" />
                                    Provider
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                                    {selectedProviderData?.label ?? "Provider"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    <Film className="h-3.5 w-3.5" />
                                    Render
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                                    {selectedRender ?? "—"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    <Globe className="h-3.5 w-3.5" />
                                    Visibility
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                                    {selectedProviderData?.capabilities?.supportsPrivacy
                                      ? visibility
                                      : "N/A"}
                                  </p>
                                </div>
                                {selectedProviderData?.capabilities?.supportsSchedule &&
                                visibility === "scheduled" ? (
                                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                      <CalendarClock className="h-3.5 w-3.5" />
                                      Schedule
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                                      {scheduleAt
                                        ? scheduleAt.toLocaleString()
                                        : "Pick a publish time"}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </Card>
                      </div>
                    )}
                  </StepperMotion>
                )}
              </StepperContent>
            </StepperShell>
          )}
        </div>

        <ResponsiveDrawerFooter>
          <StepperFooter>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={activeStepIndex === 0 || submitting}
              >
                Back
              </Button>
              {stepId !== "review" ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    submitting ||
                    (stepId === "provider" && !canContinueProvider) ||
                    (stepId === "render" && !canContinueRender) ||
                    (stepId === "details" && !canContinueDetails) ||
                    (stepId === "options" && !canContinueOptions)
                  }
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handlePublish}
                  disabled={!canContinueDetails || submitting}
                  loading={submitting}
                  loadingText="Publishing..."
                >
                  Publish
                </Button>
              )}
            </div>
            {/* <ResponsiveDrawerClose asChild>
              <Button type="button" variant="ghost" disabled={submitting}>
                Cancel
              </Button>
            </ResponsiveDrawerClose> */}
          </StepperFooter>
        </ResponsiveDrawerFooter>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
