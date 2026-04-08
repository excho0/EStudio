"use client";

import { JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconSelect } from "@/components/ui/icon-select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
  ResponsiveDrawerTrigger,
} from "@/components/ui/responsive-drawer";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useContentList } from "@/hooks/use-content";
import type { ContentStatus } from "@/lib/data/content";
import type { ContentItem } from "@/types";
import { useRenderProgress } from "@/hooks/use-progress";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import { ResponsiveActionMenu } from "@/components/controls/responsive-action-menu";
import { PublishDrawer } from "@/components/publishing/publish-drawer";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  CheckCircle2,
  Eye,
  Film,
  Loader2,
  Play,
  Radio,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarClock,
  History,
  ListFilter,
  Type,
  Activity,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/shared/utils";
import React from "react";
import { queryKeys } from "@/lib/http/query-keys";
import {
  reconcileResourceFamily,
  updateCachedContentLists,
} from "@/lib/http/query-cache";
import { sdk } from "@/lib/sdk";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import type { ContentColumnMeta } from "@/types";
import { getOutputDefaultsForMode, normalizeSettingsMap } from "@/lib/content/modes";
import {
  contentModeUiRegistry,
  getContentModeDefinition,
} from "@/lib/content/modes/ui-registry";
import { useDeleteContentMutation } from "@/hooks/use-content";

const stateTransition = {
  initial: { opacity: 0, y: 10, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(2px)" },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

export default function LibraryPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    "all" | ContentStatus
  >("all");
  const [sortBy, setSortBy] = useState<
    "createdAt" | "updatedAt" | "title" | "status"
  >("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const limit = 20;
  const queryClient = useQueryClient();
  const deleteContentMutation = useDeleteContentMutation();
  const { items, loading, total } = useContentList({
    query: debouncedQuery,
    page,
    limit,
    status: statusFilter,
    sortBy,
    sortDir,
    enableSocketRefresh: true,
  });
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [renderModePickerOpen, setRenderModePickerOpen] = useState(false);
  const [pendingRenderItem, setPendingRenderItem] = useState<ContentItem | null>(null);
  const [pendingRenderMode, setPendingRenderMode] = useState<string>("");
  const [publishContentId, setPublishContentId] = useState<string | null>(null);
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const publishCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const renderProgress = useRenderProgress({ paused: openActionMenuId !== null });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / limit)),
    [limit, total]
  );
  const [stableTotalPages, setStableTotalPages] = useState(1);
  const formatDate = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(value)
      ),
    []
  );
  const formatDateTime = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)),
    []
  );
  useEffect(() => {
    if (!loading && totalPages > 0) {
      setStableTotalPages(totalPages);
    }
  }, [loading, totalPages]);

  const displayTotalPages = Math.max(totalPages, stableTotalPages);
  const canGoBack = page > 1;
  const canGoNext = page < displayTotalPages;
  const isMobile = useIsMobile();
  const [isHydrated, setIsHydrated] = useState(false);
  const pageState: "loading" | "empty" | "ready" = loading
    ? "loading"
    : total === 0
      ? "empty"
      : "ready";
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => 96,
    overscan: 12,
    getItemKey: (index) => items[index]?.id ?? index,
  });
  useEffect(() => {
    desktopVirtualizer.measure();
  }, [desktopVirtualizer, isMobile, items.length, pageState, page]);
  const renderMutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode?: string }) => {
      await sdk.content.triggerRender(id, mode ? { mode } : undefined);
      return { id };
    },
    onSuccess: ({ id }) => {
      updateCachedContentLists({
        queryClient,
        updater: (item) =>
          item.id === id ? { ...item, status: "queued" } : item,
      });
      void reconcileResourceFamily({ queryClient, queryKey: queryKeys.contentListBase });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Render failed. Please check server logs.";
      toast.error(message);
    },
  });

  const getConfiguredRenderModes = useCallback((item: ContentItem) => {
    const settingsMap = normalizeSettingsMap(item.mode, item.settings ?? {});
    return Object.keys(settingsMap).filter(
      (modeId) => modeId in contentModeUiRegistry
    );
  }, []);

  const startRender = useCallback(
    async (item: ContentItem, mode?: string) => {
      await renderMutation.mutateAsync({ id: item.id, mode });
    },
    [renderMutation]
  );

  const startRenderAllModes = useCallback(
    async (item: ContentItem) => {
      const modes = getConfiguredRenderModes(item);
      if (modes.length === 0) {
        toast.error("No configured modes found for this content.");
        return;
      }
      const results = await Promise.allSettled(
        modes.map((mode) => sdk.content.triggerRender(item.id, { mode }))
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        const firstError = failed[0];
        const reason =
          firstError && firstError.status === "rejected" && firstError.reason instanceof Error
            ? firstError.reason.message
            : "Some modes failed to queue.";
        toast.error(
          `Queued ${modes.length - failed.length}/${modes.length} modes. ${reason}`
        );
      }
      updateCachedContentLists({
        queryClient,
        updater: (entry) =>
          entry.id === item.id ? { ...entry, status: "queued" } : entry,
      });
      void reconcileResourceFamily({ queryClient, queryKey: queryKeys.contentListBase });
    },
    [getConfiguredRenderModes, queryClient]
  );

  const handleRender = useCallback(
    async (item: ContentItem) => {
      const modes = getConfiguredRenderModes(item);
      if (modes.length > 1) {
        setPendingRenderItem(item);
        setPendingRenderMode(item.mode && modes.includes(item.mode) ? item.mode : modes[0]);
        setRenderModePickerOpen(true);
        return;
      }
      await startRender(item, modes[0]);
    },
    [getConfiguredRenderModes, startRender]
  );

  const configuredPendingModes = useMemo(
    () => (pendingRenderItem ? getConfiguredRenderModes(pendingRenderItem) : []),
    [getConfiguredRenderModes, pendingRenderItem]
  );

  const getPageItems = () => {
    if (displayTotalPages <= 1) return [];
    if (displayTotalPages <= 7) {
      return Array.from({ length: displayTotalPages }, (_, index) => index + 1);
    }
    const pages = new Set<number>([
      1,
      displayTotalPages,
      page,
      Math.max(1, page - 1),
      Math.min(displayTotalPages, page + 1),
    ]);
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleDelete = useCallback(async (id: string, keepRenders?: boolean) => {
    try {
      await deleteContentMutation.mutateAsync({ id, keepRenders });
      toast.success("Item deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Delete failed. Please try again.";
      toast.error(message);
    }
  }, [deleteContentMutation]);

  const handleCancelRender = useCallback(
    async (item: ContentItem) => {
      try {
        await sdk.content.cancelRender(item.id);
        updateCachedContentLists({
          queryClient,
          updater: (entry) =>
            entry.id === item.id ? { ...entry, status: "uploaded" } : entry,
        });
        void reconcileResourceFamily({ queryClient, queryKey: queryKeys.contentListBase });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to cancel render.";
        toast.error(message);
      }
    },
    [queryClient]
  );

  const getEffectiveStatus = useCallback(
    (item: ContentItem) =>
      renderProgress[item.id] ? "rendering" : item.status,
    [renderProgress]
  );

  const getActionItems = useCallback((item: ContentItem) => [
    ...(() => {
      const effectiveStatus = getEffectiveStatus(item);
      return [
    {
      label: "Details",
      icon: Eye,
      href: `/edit/${item.id}`,
    },
    ...(effectiveStatus === "rendered" || effectiveStatus === "rendering"
      ? [
          {
            label: "Publish",
            icon: Upload,
            onSelect: () => {
              setPublishContentId(item.id);
              setPublishDrawerOpen(true);
            },
          },
        ]
      : []),
        ...(item.publishesCount && item.publishesCount > 0
      ? [
          {
            label: "View Publishes",
            icon: Radio,
            href: `/publishes/${item.id}`,
          },
        ]
      : []),
    { type: "separator" as const },
    {
      label:
        effectiveStatus === "rendering"
          ? "Rendering..."
          : "Render now",
      icon: effectiveStatus === "rendering" ? Loader2 : Play,
      iconClassName:
        effectiveStatus === "rendering" ? "animate-spin" : undefined,
      onSelect: () => handleRender(item),
      disabled: effectiveStatus === "rendering",
    },
    ...(effectiveStatus === "rendered" || effectiveStatus === "rendering"
      ? [
          {
            label: "View renders",
            icon: Film,
            href: `/renders/${item.id}`,
          },
        ]
      : []),
    { type: "separator" as const },
    ...(effectiveStatus === "rendering"
      ? [
          {
            type: "confirm" as const,
            label: "Cancel render",
            icon: XCircle,
            description:
              "Cancel the current render job for this item. If it is already running, cancellation will be requested and applied as soon as possible.",
            onConfirm: () => {
              void handleCancelRender(item);
            },
            destructive: true,
          },
          { type: "separator" as const },
        ]
      : []),
    {
      type: "confirm" as const,
      label: "Delete",
      icon: Trash2,
      description:
        "This will remove the upload and rendered file from local storage. This action cannot be undone.",
      confirmCheckbox: {
        label: "Keep rendered files",
        defaultChecked: false,
        valueKey: "keepRenders" as const,
      },
      onConfirm: (options: { keepRenders?: boolean } | undefined) =>
        handleDelete(item.id, options?.keepRenders),
      destructive: true,
    },
  ];
    })(),
  ], [
    getEffectiveStatus,
    handleCancelRender,
    handleDelete,
    handleRender,
  ]);


  const columns = useMemo<ColumnDef<ContentItem, unknown>[]>(() => [
    {
      id: "project",
      header: "Project",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <ImageWithSkeleton
              src={`/api/content/${item.id}/asset?type=thumbnail&v=${encodeURIComponent(
                item.updatedAt
              )}`}
              alt={`${item.title} thumbnail`}
              className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
              wrapperClassName="h-12 w-16 rounded-md"
            />
            <div className="min-w-0">
              <div className="truncate font-medium">{item.title}</div>
              <div className="truncate text-xs text-slate-500 dark:text-zinc-500">
                {formatDateTime(item.createdAt)}
              </div>
            </div>
          </div>
        );
      },
      meta: { cellClassName: "py-4" } satisfies ContentColumnMeta,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <JobStatusBadge
          status={getEffectiveStatus(row.original)}
          showLabel
          progress={renderProgress[row.original.id]?.progress}
        />
      ),
    },
    {
      id: "settings",
      header: "Settings",
      cell: ({ row }) => {
        const item = row.original;
        const settingsMap = normalizeSettingsMap(item.mode, item.settings ?? {});
        const activeSettings =
          (settingsMap[item.mode ?? "video_loop"] as Record<string, unknown> | undefined) ?? {};
        const output = getOutputDefaultsForMode(item.mode, activeSettings);
        return (
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            {/* <div>
              {item.segmentDurationSeconds}s segments / {item.fadeDurationSeconds}s
              {" "}fade
            </div> */}
            <div className="text-slate-500 dark:text-zinc-500">
              {output.width}x{output.height} @ {output.fps}fps
            </div>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap justify-center gap-2">
          <ResponsiveActionMenu
            items={getActionItems(row.original)}
            open={openActionMenuId === row.original.id}
            onOpenChange={(nextOpen) =>
              setOpenActionMenuId(nextOpen ? row.original.id : null)
            }
          />
        </div>
      ),
      meta: { align: "center", cellClassName: "text-center" } satisfies ContentColumnMeta,
    },
  ], [
    formatDateTime,
    getActionItems,
    getEffectiveStatus,
    openActionMenuId,
    renderProgress
  ]);

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const desktopVirtualItems = desktopVirtualizer.getVirtualItems();
  const filtersPanel = (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-[0.2em] md:hidden">
          Direction
        </Label>
        <IconSelect
          value={sortDir}
          onValueChange={(value) => {
            setSortDir(value);
            setPage(1);
          }}
          triggerClassName="h-9 w-full"
          placeholder="Direction"
          options={[
            { value: "desc", label: "Descending", icon: ArrowDownWideNarrow },
            { value: "asc", label: "Ascending", icon: ArrowUpWideNarrow },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-[0.2em] md:hidden">
          Status
        </Label>
        <IconSelect
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          triggerClassName="h-9 w-full"
          placeholder="All statuses"
          options={[
            { value: "all", label: "All statuses", icon: ListFilter },
            { value: "uploaded", label: "Uploaded", icon: Upload },
            { value: "queued", label: "Queued", icon: Play },
            { value: "rendering", label: "Rendering", icon: Loader2 },
            { value: "rendered", label: "Rendered", icon: CheckCircle2 },
            { value: "failed", label: "Failed", icon: XCircle },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-[0.2em] md:hidden">
          Sort by
        </Label>
        <IconSelect
          value={sortBy}
          onValueChange={(value) => {
            setSortBy(value);
            setPage(1);
          }}
          triggerClassName="h-9 w-full"
          placeholder="Sort by"
          options={[
            { value: "createdAt", label: "Created", icon: CalendarClock },
            { value: "updatedAt", label: "Updated", icon: History },
            { value: "title", label: "Title", icon: Type },
            { value: "status", label: "Status", icon: Activity },
          ]}
        />
      </div>
    </div>
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const DesktopSkeletonRows = () => (
    <div className="overflow-x-hidden overflow-y-hidden">
      <Table className="-mb-12">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
            <th className="py-3">Project</th>
            <th>Status</th>
            <th>Settings</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {Array.from({ length: 8 }).map((_, index) => (
            <tr key={`skeleton-row-${index}`} className="border-t border-slate-200 dark:border-white/10">
              <td className="py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-16 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </td>
              <td>
                <Skeleton className="h-6 w-24 rounded-full" />
              </td>
              <td>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </td>
              <td className="text-right">
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-10 rounded-md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );

  const MobileSkeletonCards = () => (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`skeleton-card-${index}`}
          className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20 -mb-2"
        >
          <div className="flex flex-1 gap-3">
            <Skeleton className="h-16 w-20 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-10 rounded-md" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <ResponsiveDrawer
        open={renderModePickerOpen}
        onOpenChange={setRenderModePickerOpen}
        className="w-full"
      >
        <ResponsiveDrawerHeader>
          <ResponsiveDrawerTitle>Choose Render Mode</ResponsiveDrawerTitle>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerContent className="space-y-4 px-4 pb-4">
            {pendingRenderItem ? (
              <>
                <p className="text-sm text-slate-600 dark:text-zinc-300">
                  Select which mode configuration to render for{" "}
                  <span className="font-semibold">{pendingRenderItem.title || "Untitled"}</span>.
                </p>
                <IconSelect
                  id="render-mode"
                  value={pendingRenderMode}
                  onValueChange={setPendingRenderMode}
                  placeholder="Select mode"
                  triggerClassName="w-full"
                  options={configuredPendingModes.map((modeId) => ({
                    value: modeId,
                    label: getContentModeDefinition(modeId).label,
                    icon: contentModeUiRegistry[modeId]?.icon ?? SlidersHorizontal,
                  }))}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      if (!pendingRenderItem) return;
                      setRenderModePickerOpen(false);
                      const itemToRender = pendingRenderItem;
                      setPendingRenderItem(null);
                      await startRenderAllModes(itemToRender);
                    }}
                    disabled={configuredPendingModes.length === 0}
                  >
                    {configuredPendingModes.length > 0
                      ? `Render all modes (${configuredPendingModes.length})`
                      : "Render all modes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRenderModePickerOpen(false);
                      setPendingRenderItem(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!pendingRenderItem || !pendingRenderMode) return;
                      setRenderModePickerOpen(false);
                      const itemToRender = pendingRenderItem;
                      const modeToRender = pendingRenderMode;
                      setPendingRenderItem(null);
                      await startRender(itemToRender, modeToRender);
                    }}
                  >
                    Render
                  </Button>
                </div>
              </>
            ) : null}
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
      {publishContentId ? (
        <PublishDrawer
          contentId={publishContentId}
          open={publishDrawerOpen}
          onOpenChange={(nextOpen) => {
            setPublishDrawerOpen(nextOpen);
            if (publishCloseTimeoutRef.current) {
              clearTimeout(publishCloseTimeoutRef.current);
            }
            if (!nextOpen) {
              publishCloseTimeoutRef.current = setTimeout(() => {
                setPublishContentId(null);
              }, 260);
            }
          }}
        />
      ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Library</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 hidden lg:block">
              Manage your uploaded content, previews, and renders.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex w-full items-center gap-2 sm:justify-end">
              <Input
                placeholder="Search by title, status, or id..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-72"
              />
              <ResponsiveDrawer>
                <ResponsiveDrawerTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 md:hidden"
                    aria-label="Open filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </ResponsiveDrawerTrigger>
                <ResponsiveDrawerHeader>
                  <ResponsiveDrawerTitle>Filters</ResponsiveDrawerTitle>
                </ResponsiveDrawerHeader>
                <ResponsiveDrawerContent className="px-4 pb-4">
                  {filtersPanel}
                </ResponsiveDrawerContent>
              </ResponsiveDrawer>
            </div>
            <div className="hidden md:block">{filtersPanel}</div>
            {total >= 0 && query && (
              <span className="text-xs text-slate-500 dark:text-zinc-500">
                Showing {items.length} of {total}
              </span>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
        {pageState === "loading" ? (
          <motion.div key="library-loading" {...stateTransition} className="mt-6">
            {!isHydrated ? (
              <></>
            ) : isMobile ? (
                <MobileSkeletonCards />
            ) : (
                <DesktopSkeletonRows />
            )}
          </motion.div>
        ) : pageState === "empty" ? (
          <motion.div
            key="library-empty"
            {...stateTransition}
            className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400"
          >
            No matches found. Try a different search.
          </motion.div>
        ) : (
          <motion.div key="library-ready" {...stateTransition}>
            {items.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
                No items on this page yet. Try changing filters or go to page 1.
              </div>
            ) : null}
            {!isMobile && (
            <div className="mt-6">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[50%]" />
                    <col className="w-[16%]" />
                    <col className="w-[22%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <TableHeader className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const meta = header.column.columnDef.meta as
                            | ContentColumnMeta
                            | undefined;
                          return (
                            <TableHead
                              key={header.id}
                              className={cn(
                                meta?.headerClassName,
                                meta?.align === "center" && "text-center",
                                meta?.align === "right" && "text-right",
                                header.id === "project" && "py-3"
                              )}
                            >
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                </Table>
              </div>
              <ScrollArea
                className="h-[clamp(20rem,56svh,68svh)]"
                viewportRef={desktopScrollRef}
              >
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[50%]" />
                    <col className="w-[16%]" />
                    <col className="w-[22%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <TableBody className="text-sm">
                    {desktopVirtualItems[0]?.start ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          style={{ height: desktopVirtualItems[0].start }}
                        />
                      </TableRow>
                    ) : null}
                    {desktopVirtualItems.length > 0
                      ? desktopVirtualItems.map((virtualRow) => {
                          const row = table.getRowModel().rows[virtualRow.index];
                          if (!row) return null;
                          const item = row.original;
                          return (
                            <React.Fragment key={row.id}>
                              <TableRow
                                data-index={virtualRow.index}
                                ref={desktopVirtualizer.measureElement}
                                progress={getEffectiveStatus(item) === "rendering" ? Math.round((renderProgress[item.id]?.progress ?? 0) * 100) : null}
                                progressClassName="[--table-row-progress-color:rgb(15_23_42_/_0.05)] dark:[--table-row-progress-color:rgb(255_255_255_/_0.07)]"
                                className="border-t border-slate-200 dark:border-white/10"
                              >
                                {row.getVisibleCells().map((cell) => {
                                  const meta = cell.column.columnDef.meta as
                                    | ContentColumnMeta
                                    | undefined;
                                  return (
                                    <TableCell
                                      key={cell.id}
                                      className={cn(
                                        meta?.cellClassName,
                                        meta?.align === "center" && "text-center",
                                        meta?.align === "right" && "text-right"
                                      )}
                                    >
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </React.Fragment>
                          );
                        })
                      : table.getRowModel().rows.map((row) => {
                          const item = row.original;
                          return (
                            <React.Fragment key={row.id}>
                              <TableRow
                                progress={getEffectiveStatus(item) === "rendering" ? Math.round((renderProgress[item.id]?.progress ?? 0) * 100) : null}
                                progressClassName="[--table-row-progress-color:rgb(15_23_42_/_0.05)] dark:[--table-row-progress-color:rgb(255_255_255_/_0.07)]"
                                className="border-t border-slate-200 dark:border-white/10"
                              >
                                {row.getVisibleCells().map((cell) => {
                                  const meta = cell.column.columnDef.meta as
                                    | ContentColumnMeta
                                    | undefined;
                                  return (
                                    <TableCell
                                      key={cell.id}
                                      className={cn(
                                        meta?.cellClassName,
                                        meta?.align === "center" && "text-center",
                                        meta?.align === "right" && "text-right"
                                      )}
                                    >
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </React.Fragment>
                          );
                        })}
                    {desktopVirtualItems.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          style={{
                            height:
                              desktopVirtualizer.getTotalSize() -
                              desktopVirtualItems[desktopVirtualItems.length - 1].end,
                          }}
                        />
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            )}

            {isMobile && items.length > 0 && (
            <div className="mt-6">
              <ScrollArea 
                className="h-[clamp(20rem,56svh,68svh)]"
                viewportRef={mobileScrollRef}
              >
                <div className="grid min-w-0 grid-cols-1 gap-3">
                  {items.map((item) => (
                    <div key={item.id} className="w-full">
                      <Card
                        animateHeight={false}
                        progress={getEffectiveStatus(item) === "rendering" ? Math.round((renderProgress[item.id]?.progress ?? 0) * 100) : null}
                        progressClassName="bg-black/6 ring-black/5 dark:bg-white/8 dark:ring-white/6"
                        className="gap-3 border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-4 overflow-hidden">
                          <div className="flex min-w-0 flex-1 gap-3 overflow-hidden">
                            <ImageWithSkeleton
                              src={`/api/content/${item.id}/asset?type=thumbnail&v=${encodeURIComponent(
                                item.updatedAt
                              )}`}
                              alt={`${item.title} thumbnail`}
                              className="h-16 w-20 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                              wrapperClassName="h-16 w-20 rounded-md"
                            />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="truncate text-sm font-semibold">{item.title}</div>
                              <div className="truncate text-xs text-slate-500 dark:text-zinc-500">
                                {formatDate(item.createdAt)}
                              </div>
                              <div className="mt-2 min-w-0 max-w-full overflow-hidden">
                                <JobStatusBadge
                                  status={getEffectiveStatus(item)}
                                  progress={renderProgress[item.id]?.progress}
                                  className="max-w-full shrink-0 [&>span]:min-w-0 [&>span]:max-w-full [&>span]:overflow-hidden [&>span]:truncate [&>span>span:first-child]:truncate"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-start justify-end">
                            <ResponsiveActionMenu items={getActionItems(item)} />
                          </div>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>

        <div
          className={cn(
            "flex items-center justify-center transition-opacity",
            displayTotalPages > 1 || page > 1 ? "visible" : "invisible"
          )}
        >
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    className="border border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    aria-disabled={!canGoBack || loading}
                  />
                </PaginationItem>
                {getPageItems().flatMap((pageNumber, index, list) => {
                  const items: JSX.Element[] = [];
                  const previous = list[index - 1];
                  if (typeof previous === "number" && pageNumber - previous > 1) {
                    items.push(
                      <PaginationItem key={`ellipsis-${previous}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }
                  items.push(
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        isActive={pageNumber === page}
                        onClick={() => setPage(pageNumber)}
                        aria-disabled={loading}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                  return items;
                })}
                <PaginationItem>
                  <PaginationNext
                    className="border border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(displayTotalPages, current + 1)
                      )
                    }
                    aria-disabled={!canGoNext || loading}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
        </div>
    </div>
  );
}
