"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarClock,
  CheckCircle2,
  Film,
  Globe,
  GripVertical,
  Link2,
  Lock,
  PencilLine,
  RotateCcw,
  Sparkles,
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
import { Switch } from "@/components/ui/switch";
import { SelectableCard } from "@/components/ui/selectable-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputList,
} from "@/components/ui/tags-input";
import DatePickerStandard2 from "@/components/controls/date-picker-standard-2";
import { IconSelect, type IconSelectOption } from "@/components/ui/icon-select";
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
import { sdk } from "@/lib/sdk";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type RenderItem,
  useCreatePublishMutation,
  usePublishProgressTracker,
  usePublishTargets,
} from "@/hooks/use-publishing";
import { Link } from "@/components/navigation/route-transition";
import { cn } from "@/lib/shared/utils";
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

const formatDateTime = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const PublishRenderThumbnail = ({
  item,
  className,
  iconClassName,
}: {
  item: RenderItem;
  className: string;
  iconClassName: string;
}) => {
  if (item.thumbnailUrl) {
    return (
      <ImageWithSkeleton
        src={item.thumbnailUrl}
        alt={`Preview thumbnail for ${item.name}`}
        className={className}
        wrapperClassName="rounded-md shrink-0"
        loading="lazy"
      />
    );
  }

  return (
    <div className={`${className} flex items-center justify-center`}>
      <Film className={iconClassName} />
    </div>
  );
};

const hexToRgba = (hex: string, alpha: number) => {
  const cleanHex = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const r = Number.parseInt(cleanHex.slice(0, 2), 16);
  const g = Number.parseInt(cleanHex.slice(2, 4), 16);
  const b = Number.parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const roundedSurfaceMask = {
  WebkitMaskImage: "-webkit-radial-gradient(white, black)",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden" as const,
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

const SortableTagItem = ({ value }: { value: string }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("touch-none", isDragging && "z-10 opacity-70")}
    >
      <TagsInputItem
        value={value}
        className={cn(
          "min-h-9 items-center gap-2 border-slate-200/80 bg-white/90 pl-2 pr-1.5 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/85",
          isDragging && "opacity-80"
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="inline-flex size-4 shrink-0 cursor-grab items-center justify-center self-center rounded-sm text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:text-white/40 dark:hover:text-white/70"
          aria-label={`Reorder tag ${value}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5 shrink-0" />
        </button>
        <TagsInputItemText className="min-w-0 flex-1">{value}</TagsInputItemText>
        <TagsInputItemDelete />
      </TagsInputItem>
    </div>
  );
};

export function PublishDrawer({
  contentId,
  trigger,
  onPublished,
  open: controlledOpen,
  onOpenChange,
}: PublishDrawerProps) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [stepId, setStepId] = useState(steps[0].id);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedRender, setSelectedRender] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [contentTitle, setContentTitle] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailCacheBust, setThumbnailCacheBust] = useState<number | null>(
    null
  );
  const [thumbnailAssetPath, setThumbnailAssetPath] = useState<string | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [visibility, setVisibility] = useState<
    "public" | "unlisted" | "private" | "scheduled"
  >("private");
  const [scheduleAt, setScheduleAt] = useState<Date | undefined>(undefined);
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);
  const preserveDraftThumbnailRef = useRef(false);
  const renderScrollRef = useRef<HTMLDivElement | null>(null);
  const tagSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );
  const {
    connectedTargets,
    publishTargetsQuery,
    contentSummaryQuery,
    rendersQuery,
  } = usePublishTargets({ contentId, open });
  const publishMutation = useCreatePublishMutation(contentId);
  const [activePublishId, setActivePublishId] = useState<string | null>(null);
  const {
    publishStatus,
    setPublishStatus,
    publishStage,
    publishProgress,
    publishBytes,
  } = usePublishProgressTracker(activePublishId);

  const selectedProviderData = useMemo(
    () => connectedTargets.find((target) => target.id === selectedProvider) ?? null,
    [connectedTargets, selectedProvider]
  );

  const renders = rendersQuery.data ?? [];
  const loading = publishTargetsQuery.isLoading || publishTargetsQuery.isFetching;
  const rendersLoading = rendersQuery.isLoading || rendersQuery.isFetching;
  const renderVirtualizer = useVirtualizer({
    count: renders.length,
    getScrollElement: () => renderScrollRef.current,
    estimateSize: () => (isMobile ? 132 : 104),
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
  const providerName = selectedProviderData?.label ?? "Provider";
  const visibilityLabel = selectedProviderData?.capabilities?.supportsPrivacy
    ? visibility[0]?.toUpperCase() + visibility.slice(1)
    : "Default";
  const scheduleLabel =
    selectedProviderData?.capabilities?.supportsSchedule && visibility === "scheduled"
      ? scheduleAt
        ? scheduleAt.toLocaleString()
        : "Pick a publish time"
      : null;
  const reviewDescription = description.trim();
  const reviewPalette = useMemo(
    () => contentSummaryQuery.data?.colorPalette?.filter(Boolean) ?? [],
    [contentSummaryQuery.data?.colorPalette]
  );
  const reviewGradient = useMemo(() => {
    const accent = reviewPalette[0] ?? "#cbd5e1";
    const secondary = reviewPalette[1] ?? reviewPalette[0] ?? "#94a3b8";
    const tertiary = reviewPalette[2] ?? reviewPalette[1] ?? "#0f172a";

    return {
      backgroundImage: [
        `radial-gradient(circle at 12% 12%, ${hexToRgba(accent, 0.16)}, transparent 34%)`,
        `radial-gradient(circle at 88% 18%, ${hexToRgba(secondary, 0.12)}, transparent 28%)`,
        `linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.84) 36%, ${hexToRgba(tertiary, 0.18)} 100%)`,
      ].join(", "),
    } satisfies React.CSSProperties;
  }, [reviewPalette]);
  const reviewDarkGradient = useMemo(() => {
    const accent = reviewPalette[0] ?? "#64748b";
    const secondary = reviewPalette[1] ?? reviewPalette[0] ?? "#334155";

    return {
      backgroundImage: [
        `radial-gradient(circle at 14% 16%, ${hexToRgba(accent, 0.18)}, transparent 30%)`,
        `radial-gradient(circle at 86% 14%, ${hexToRgba(secondary, 0.14)}, transparent 26%)`,
        "linear-gradient(160deg, rgba(12,18,30,0.96) 0%, rgba(10,14,24,0.94) 48%, rgba(7,10,18,0.98) 100%)",
      ].join(", "),
    } satisfies React.CSSProperties;
  }, [reviewPalette]);
  const isCustomThumbnail = Boolean(thumbnailAssetPath);
  const resolvedThumbnailUrl = useMemo(() => {
    if (!thumbnailUrl) return null;
    if (!thumbnailCacheBust) return thumbnailUrl;
    const separator = thumbnailUrl.includes("?") ? "&" : "?";
    return `${thumbnailUrl}${separator}v=${thumbnailCacheBust}`;
  }, [thumbnailCacheBust, thumbnailUrl]);

  const cleanupDraftThumbnail = async (path: string | null) => {
    if (!path) return;
    try {
      await sdk.uploads.deleteDraft(path);
    } catch {
      // Best effort cleanup for abandoned draft thumbnails.
    }
  };

  const handleRevertThumbnail = async () => {
    const pathToDelete = thumbnailAssetPath;
    setThumbnailAssetPath(null);
    setThumbnailUrl(contentSummaryQuery.data?.thumbnailUrl ?? null);
    setThumbnailCacheBust(Date.now());
    await cleanupDraftThumbnail(pathToDelete);
  };

  const handleThumbnailFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setThumbnailUploading(true);
    try {
      const uploaded = await sdk.uploads.uploadDraft(file, "thumbnail");
      const previousDraftPath = thumbnailAssetPath;
      setThumbnailAssetPath(uploaded.path);
      setThumbnailUrl(sdk.uploads.assetUrl(uploaded.path, String(uploaded.expiresAt)));
      setThumbnailCacheBust(Date.now());
      await cleanupDraftThumbnail(previousDraftPath);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to upload thumbnail."
      );
    } finally {
      setThumbnailUploading(false);
    }
  };

  const resetState = () => {
    setStepId(steps[0].id);
    setSelectedProvider(null);
    setSelectedRender(null);
    setTitle("");
    setDescription("");
    setTags([]);
    setContentTitle(null);
    setThumbnailUrl(null);
    setThumbnailCacheBust(null);
    setThumbnailAssetPath(null);
    setThumbnailUploading(false);
    setVisibility("private");
    setScheduleAt(undefined);
    setContainsSyntheticMedia(false);
  };

  const handleTagSortEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setTags((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const openDrawer = (nextOpen: boolean) => {
    if (!nextOpen && !preserveDraftThumbnailRef.current) {
      void cleanupDraftThumbnail(thumbnailAssetPath);
    }
    if (!nextOpen) {
      preserveDraftThumbnailRef.current = false;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
      setActivePublishId(null);
    }
  };

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
    if (thumbnailAssetPath) return;
    setThumbnailUrl(contentSummaryQuery.data.thumbnailUrl);
    setThumbnailCacheBust(Date.now());
  }, [contentSummaryQuery.data?.thumbnailUrl, open, thumbnailAssetPath]);

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
      preserveDraftThumbnailRef.current = true;
      const scheduleEnabled =
        selectedProviderData?.capabilities?.supportsSchedule &&
        visibility === "scheduled";
      const scheduleValue = scheduleEnabled ? scheduleAt?.toISOString() : null;
      const privacyValue = visibility === "scheduled" ? "private" : visibility;
      const connectionId = selectedProviderData?.connectionId ?? null;
      if (!connectionId) {
        throw new Error("Missing provider connection.");
      }
      const publishId = await publishMutation.mutateAsync({
        provider: selectedProvider,
        renderId: selectedRender,
        connectionId,
        metadata: {
          title: title.trim(),
          description: description.trim(),
          tags:
            selectedProviderData?.capabilities?.supportsTags && tags.length > 0
              ? tags
              : undefined,
          options: {
            privacy: selectedProviderData?.capabilities?.supportsPrivacy
              ? privacyValue
              : undefined,
            scheduleAt: scheduleValue || undefined,
            containsSyntheticMedia:
              selectedProviderData?.capabilities?.supportsSyntheticMediaDisclosure
                ? containsSyntheticMedia
                : undefined,
          },
          thumbnailUrl: thumbnailUrl ?? undefined,
          thumbnailAssetPath: thumbnailAssetPath ?? undefined,
        },
      });
      if (publishId) {
        setActivePublishId(publishId);
        setPublishStatus("queued");
        onPublished?.(publishId);
      }
      openDrawer(false);
    } catch (error) {
      preserveDraftThumbnailRef.current = false;
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
    <ResponsiveDrawer
      open={open}
      onOpenChange={openDrawer}
      className="flex w-screen max-w-none flex-col overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-h-[min(92dvh,980px)] sm:border md:w-[min(90vw,1320px)] md:max-w-[min(90vw,1320px)] lg:w-[min(86vw,1040px)] lg:max-w-[min(86vw,1440px)]"
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
      {trigger ? (
        <ResponsiveDrawerTrigger asChild>{trigger}</ResponsiveDrawerTrigger>
      ) : null}
      <ResponsiveDrawerHeader className="shrink-0 border-b border-slate-200 px-4 py-4 text-left dark:border-white/10 sm:px-5">
        <ResponsiveDrawerTitle className="text-xl">
          Publish
        </ResponsiveDrawerTitle>
        <ResponsiveDrawerDescription>
          Pick a destination, choose a render, then add your metadata.
        </ResponsiveDrawerDescription>
      </ResponsiveDrawerHeader>

      <ResponsiveDrawerContent className="min-h-0 px-4 pb-4">
        <div className="flex-1">
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
              <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 pb-3 pt-1 backdrop-blur supports-backdrop-filter:bg-background">
                <StepperHeader />
              </div>
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
                            ) : (
                              <div className="grid w-full gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                                {connectedTargets.map((target) => {
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
                            { !loading && connectedTargets.length === 0 && (
                              <>
                                <span className="underline font-bold text-primary">No providers connected!</span>
                                <span> you can</span>
                              </>
                            )}
                              
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
                              <ScrollArea
                                className="h-[clamp(18rem,42svh,30rem)]"
                                viewportRef={renderScrollRef}
                                contentGap="0.45rem"
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
                                        ref={renderVirtualizer.measureElement}
                                        className="absolute left-0 top-0 w-full"
                                        style={{
                                          transform: `translateY(${row.start}px)`,
                                        }}
                                      >
                                        <SelectableCard
                                          selected={isSelected}
                                          onClick={() =>
                                            setSelectedRender(render.name)
                                          }
                                          className="rounded-[1.35rem]"
                                        >
                                          <div className="flex min-w-0 items-center gap-3">
                                            <PublishRenderThumbnail
                                              item={render}
                                              className="h-16 w-20 rounded-md border border-slate-200 bg-slate-50 object-cover text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                                              iconClassName="h-5 w-5"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                {render.name}
                                              </p>
                                              <p className="truncate text-xs text-muted-foreground">
                                                {formatBytes(render.size)} · {formatDateTime(render.mtimeMs)}
                                              </p>
                                            </div>
                                          </div>
                                        </SelectableCard>
                                      </div>
                                    );
                                  })}
                                </div>
                              </ScrollArea>
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
                            <input
                              ref={thumbnailFileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={handleThumbnailFileChange}
                            />
                            <div className="flex w-full gap-4">
                              {resolvedThumbnailUrl ? (
                                <ImageWithSkeleton
                                  src={resolvedThumbnailUrl}
                                  alt={contentTitle ?? "Content thumbnail"}
                                  className="h-16 w-28 rounded-md object-cover"
                                  wrapperClassName="h-16 w-28 rounded-md shrink-0"
                                />
                              ) : (
                                <div className="h-16 w-28 shrink-0 rounded-md bg-muted" />
                              )}
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                                    {isCustomThumbnail
                                      ? "Custom thumbnail selected"
                                      : "Using content thumbnail"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {isCustomThumbnail
                                      ? "This upload will use your custom thumbnail instead of the content default."
                                      : "Derived from the main content item. You can replace it just for this publish."}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {isCustomThumbnail ? (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="size-9 rounded-full"
                                      onClick={() => void handleRevertThumbnail()}
                                      disabled={thumbnailUploading || submitting}
                                      aria-label="Revert to content thumbnail"
                                    >
                                      <RotateCcw className="size-4 shrink-0" />
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-9 rounded-full"
                                    onClick={() => thumbnailFileInputRef.current?.click()}
                                    disabled={thumbnailUploading || submitting}
                                    aria-label={
                                      isCustomThumbnail
                                        ? "Change custom thumbnail"
                                        : "Change thumbnail"
                                    }
                                  >
                                    <PencilLine className="size-4 shrink-0" />
                                  </Button>
                                </div>
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
                            className="resize-none"
                            rows={4}
                          />
                        </div>
                        {selectedProviderData?.capabilities?.supportsTags ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-900 dark:text-white">
                              Tags
                            </label>
                            <p className="text-sm text-muted-foreground">
                              Add keywords to help organize this upload. Drag to reorder and click a tag to edit it.
                            </p>
                            <TagsInput
                              value={tags}
                              onValueChange={setTags}
                              onValidate={(value) => {
                                const normalized = value.trim();
                                return (
                                  normalized.length >= 2 &&
                                  normalized.length <= 30 &&
                                  !tags.some(
                                    (tag) =>
                                      tag.toLowerCase() === normalized.toLowerCase()
                                  )
                                );
                              }}
                              onInvalid={() => {
                                toast.error(
                                  "Tags must be unique and between 2 and 30 characters."
                                );
                              }}
                              editable
                              addOnPaste
                              addOnTab
                              blurBehavior="add"
                              delimiter=","
                              max={12}
                              className="w-full gap-3"
                            >
                              <DndContext
                                sensors={tagSensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleTagSortEnd}
                              >
                                <SortableContext
                                  items={tags}
                                  strategy={rectSortingStrategy}
                                >
                                  <TagsInputList className="min-h-12 gap-2  border-slate-200/80 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/5">
                                    {tags.map((tag) => (
                                      <SortableTagItem key={tag} value={tag} />
                                    ))}
                                    <TagsInputInput
                                      placeholder={
                                        tags.length === 0
                                          ? "Add tags and press Enter…"
                                          : "Add another tag…"
                                      }
                                      className="min-w-32"
                                    />
                                  </TagsInputList>
                                </SortableContext>
                              </DndContext>
                            </TagsInput>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {stepId === "options" && (
                      <div className="space-y-4">
                        {selectedProviderData?.capabilities?.supportsPrivacy ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-900 dark:text-white">
                              Visibility
                            </label>
                            {(() => {
                              const options: IconSelectOption<
                                "public" | "unlisted" | "private" | "scheduled"
                              >[] = (
                                selectedProviderData.capabilities.privacyOptions ??
                                ["public", "unlisted", "private"]
                              ).map((option) => ({
                                value: option,
                                label: option[0]!.toUpperCase() + option.slice(1),
                                icon:
                                  option === "public"
                                    ? Globe
                                    : option === "unlisted"
                                      ? Link2
                                      : Lock,
                              }));
                              if (selectedProviderData.capabilities.supportsSchedule) {
                                options.push({
                                  value: "scheduled",
                                  label: "Scheduled",
                                  icon: CalendarClock,
                                });
                              }
                              return (
                                <IconSelect
                                  value={visibility}
                                  onValueChange={(value) =>
                                    setVisibility(
                                      value as
                                        | "public"
                                        | "unlisted"
                                        | "private"
                                        | "scheduled"
                                    )
                                  }
                                  placeholder="Select visibility"
                                  triggerClassName="w-full"
                                  options={options}
                                />
                              );
                            })()}
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

                        {selectedProviderData?.capabilities?.supportsSyntheticMediaDisclosure ? (
                          <Card className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 shadow-none dark:border-white/10 dark:bg-white/3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                                  <Sparkles className="h-4 w-4 shrink-0" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                                    Synthetic media disclosure
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Tell {providerName} if this upload includes realistic AI-generated or significantly altered media.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={containsSyntheticMedia}
                                onCheckedChange={(checked) =>
                                  setContainsSyntheticMedia(Boolean(checked))
                                }
                                className="shrink-0"
                              />
                            </div>
                          </Card>
                        ) : null}
                      </div>
                    )}

                    {stepId === "review" && (
                      <div className="space-y-4">
                        <div
                          className="relative isolate w-full overflow-hidden rounded-[1.6rem] p-2 shadow-inner sm:p-2.5 border dark:border-primary-foreground"
                          style={{ ...reviewGradient, ...roundedSurfaceMask }}
                        >
                          <div
                            className="pointer-events-none absolute inset-0 hidden dark:block"
                            style={reviewDarkGradient}
                          />
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-white/28 to-transparent dark:from-white/4 dark:to-transparent" />
                          <div className="relative space-y-2">

                            <div className="grid gap-2.5 min-[720px]:grid-cols-[minmax(0,1fr)_minmax(12rem,0.34fr)]">
                              <div className="relative aspect-[16/10] min-h-[12rem] w-full overflow-hidden rounded-[1.4rem] shadow-[0_24px_48px_-30px_rgba(0,0,0,0.56)] min-[480px]:aspect-[1.5] min-[480px]:min-h-[14rem] min-[720px]:aspect-[1.65] min-[720px]:min-h-[16rem]">
                                {resolvedThumbnailUrl ? (
                                  <ImageWithSkeleton
                                    src={resolvedThumbnailUrl}
                                    alt={contentTitle ?? title}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    wrapperClassName="absolute inset-0 h-full w-full"
                                  />
                                ) : (
                                  <div className="absolute inset-0 h-full w-full bg-black" />
                                )}
                                <div className="pointer-events-none absolute inset-0 bg-white/6 dark:bg-black/16" />
                                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/72 via-black/10 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                                  <p className="line-clamp-2 text-[clamp(1rem,1.6vw,1.2rem)] font-semibold text-white">
                                    {title.trim() || contentTitle || "Untitled video"}
                                  </p>
                                  {reviewDescription ? (
                                    <p className="mt-1 line-clamp-2 max-w-[52ch] text-sm text-white/72">
                                      {reviewDescription}
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-sm text-white/58">
                                      No description added.
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-[1.4rem] bg-white/20 dark:bg-white/6">
                                <div className="grid gap-2.5 p-2 min-[720px]:grid-cols-1">
                                  <div className="rounded-[1.05rem] bg-black/8 px-3 py-2.5 dark:bg-white/4">
                                    <div className="flex items-start gap-2.5">
                                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-700 dark:bg-white/8 dark:text-slate-200">
                                        <Film className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                          Render
                                        </p>
                                        <p className="mt-1 break-all text-[0.98rem] font-semibold tracking-[-0.015em] text-slate-950 dark:text-white min-[420px]:break-normal min-[420px]:truncate">
                                          {selectedRender ?? "No render selected"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="rounded-[1.05rem] bg-black/8 px-3 py-2.5 dark:bg-white/4">
                                    <div className="flex items-start gap-2.5">
                                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-700 dark:bg-white/8 dark:text-slate-200">
                                        {visibility === "scheduled" ? (
                                          <CalendarClock className="h-4 w-4" />
                                        ) : visibility === "private" ? (
                                          <Lock className="h-4 w-4" />
                                        ) : visibility === "unlisted" ? (
                                          <Link2 className="h-4 w-4" />
                                        ) : (
                                          <Globe className="h-4 w-4" />
                                        )}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                          Visibility
                                        </p>
                                        <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.015em] text-slate-950 dark:text-white">
                                          {visibilityLabel}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  {scheduleLabel ? (
                                    <div className="rounded-[1.05rem] bg-black/8 px-3 py-2.5 dark:bg-white/4">
                                      <div className="flex items-start gap-2.5">
                                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-700 dark:bg-white/8 dark:text-slate-200">
                                          <CalendarClock className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                            Schedule
                                          </p>
                                          <p className="mt-1 text-[0.98rem] font-semibold tracking-[-0.015em] text-slate-950 dark:text-white">
                                            {scheduleLabel}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="rounded-[1.05rem] bg-black/8 px-3 py-2.5 dark:bg-white/4">
                                    <div className="flex items-start gap-2.5">
                                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-700 dark:bg-white/8 dark:text-slate-200">
                                        <Link2 className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                                          Destination
                                        </p>
                                        <p className="mt-1 break-words text-[0.98rem] font-semibold tracking-[-0.015em] text-slate-950 dark:text-white">
                                          {providerName}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  {/* <div className="pt-1.5">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                      Palette Debug
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {reviewPalette.length > 0 ? (
                                        reviewPalette.map((color) => (
                                          <div
                                            key={color}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-white/65 px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-white/8 dark:text-slate-200"
                                          >
                                            <span
                                              className="h-2.5 w-2.5 rounded-full"
                                              style={{ backgroundColor: color }}
                                            />
                                            {color}
                                          </div>
                                        ))
                                      ) : (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          No palette detected
                                        </span>
                                      )}
                                    </div>
                                  </div> */}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </StepperMotion>
                )}
              </StepperContent>
            </StepperShell>
          )}
        </div>
      </ResponsiveDrawerContent>

      <ResponsiveDrawerFooter className="sticky bottom-0 z-20 w-full shrink-0 border-t border-slate-200 bg-background/95 px-4 py-4 dark:border-white/10 sm:flex-row sm:px-5 supports-backdrop-filter:bg-background/95">
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
    </ResponsiveDrawer>
  );
}
