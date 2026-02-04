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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { Progress } from "@/components/ui/progress";
import { StatRow } from "@/components/ui/stat-row";
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
import { useContentList } from "@/components/studio/use-content-list";
import type { ContentItem } from "@/types";
import { useRenderProgress } from "@/components/studio/use-render-progress";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import { ResponsiveActionMenu } from "@/components/controls/responsive-action-menu";
import { PublishDrawer } from "@/components/publishing/publish-drawer";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import React from "react";
import { queryKeys } from "@/lib/query-keys";
import type { ContentColumnMeta } from "@/types";

export default function LibraryPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "uploaded" | "rendering" | "rendered" | "failed"
  >("all");
  const [sortBy, setSortBy] = useState<
    "createdAt" | "updatedAt" | "title" | "status"
  >("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const limit = 20;
  const queryClient = useQueryClient();
  const { items, loading, total } = useContentList({
    query: debouncedQuery,
    page,
    limit,
    status: statusFilter,
    sortBy,
    sortDir,
    enableSocketRefresh: true,
  });
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [publishContentId, setPublishContentId] = useState<string | null>(null);
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const publishCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const renderProgress = useRenderProgress();

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
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => 96,
    overscan: 12,
    getItemKey: (index) => items[index]?.id ?? index,
  });
  const mobileVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => mobileScrollRef.current,
    estimateSize: () => 164,
    overscan: 12,
    getItemKey: (index) => items[index]?.id ?? index,
  });
  const renderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/content/${id}/render`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Render failed. Please check server logs.");
      }
    },
    onSuccess: () => {
      toast.message("Render started.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Render failed. Please check server logs.";
      setError(message);
      toast.error(message);
    },
    onSettled: () => {
      setRenderingId(null);
    },
  });

  const handleRender = useCallback(async (id: string) => {
    setRenderingId(id);
    setError(null);
    await renderMutation.mutateAsync(id);
  }, [renderMutation]);

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

  const deleteMutation = useMutation({
    mutationFn: async ({
      id,
      keepRenders,
    }: {
      id: string;
      keepRenders?: boolean;
    }) => {
      const params = new URLSearchParams();
      if (keepRenders) {
        params.set("keepRenders", "1");
      }
      const query = params.toString();
      const response = await fetch(
        `/api/content/${id}${query ? `?${query}` : ""}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        throw new Error("Delete failed. Please try again.");
      }
    },
    onSuccess: () => {
      toast.success("Item deleted.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Delete failed. Please try again.";
      setError(message);
      toast.error(message);
    },
  });

  const handleDelete = useCallback(async (id: string, keepRenders?: boolean) => {
    setError(null);
    await deleteMutation.mutateAsync({ id, keepRenders });
  }, [deleteMutation]);

  const getActionItems = useCallback((item: ContentItem) => [
    {
      label: "Details",
      icon: Eye,
      href: `/edit/${item.id}`,
    },
    ...(item.status === "rendered"
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
      label: renderingId === item.id ? "Rendering..." : "Render now",
      icon: Play,
      onSelect: () => handleRender(item.id),
      disabled: renderingId === item.id,
    },
    ...(item.status === "rendered"
      ? [
          {
            label: "View renders",
            icon: Film,
            href: `/renders/${item.id}`,
          },
        ]
      : []),
    { type: "separator" as const },
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
  ], [handleDelete, handleRender, renderingId]);

  const getStatusMeta = useCallback((status: string) => {
    switch (status) {
      case "rendered":
        return {
          label: "Rendered",
          icon: CheckCircle2,
          className:
            "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200",
        };
      case "failed":
        return {
          label: "Failed",
          icon: XCircle,
          className:
            "bg-red-500/15 text-red-700 dark:bg-red-400/20 dark:text-red-200",
        };
      case "rendering":
        return {
          label: "Rendering",
          icon: Loader2,
          className:
            "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
        };
      case "uploaded":
        return {
          label: "Uploaded",
          icon: Upload,
          className:
            "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-100",
        };
      default:
        return {
          label: "Queued",
          icon: Play,
          className:
            "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-100",
        };
    }
  }, []);

  const renderStatusBadge = useCallback(
    (status: string, showLabel: boolean, progress?: number) => {
      const meta = getStatusMeta(status);
      const Icon = meta.icon;
      const showProgress = status === "rendering" && typeof progress === "number";
      const progressLabel = showProgress ? `${Math.round(progress * 100)}%` : null;
      return (
        <Badge className={`inline-flex items-center gap-2 ${meta.className}`}>
          <Icon
            className={`h-4 w-4 shrink-0 ${
              status === "rendering" ? "animate-spin" : ""
            }`}
          />
          {showLabel ? (
            <span className="flex items-center gap-2">
              <span>{meta.label}</span>
              {progressLabel ? (
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-100/80">
                  {progressLabel}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="sr-only">{meta.label}</span>
              {progressLabel ? (
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-100/80">
                  {progressLabel}
                </span>
              ) : null}
            </span>
          )}
        </Badge>
      );
    },
    [getStatusMeta]
  );

  const columns = useMemo<ColumnDef<ContentItem, unknown>[]>(() => [
    {
      id: "project",
      header: "Project",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-3">
            <ImageWithSkeleton
              src={`/api/content/${item.id}/asset?type=thumbnail&v=${encodeURIComponent(
                item.updatedAt
              )}`}
              alt={`${item.title} thumbnail`}
              className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
              wrapperClassName="h-12 w-16 rounded-md"
            />
            <div>
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-slate-500 dark:text-zinc-500">
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
      cell: ({ row }) =>
        renderStatusBadge(
          row.original.status,
          true,
          renderProgress[row.original.id]?.progress
        ),
    },
    {
      id: "settings",
      header: "Settings",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            <div>
              {item.segmentDurationSeconds}s segments / {item.fadeDurationSeconds}s
              {" "}fade
            </div>
            <div className="text-slate-500 dark:text-zinc-500">
              {item.width}x{item.height} @ {item.fps}fps
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
          <ResponsiveActionMenu items={getActionItems(row.original)} />
        </div>
      ),
      meta: { align: "center", cellClassName: "text-center" } satisfies ContentColumnMeta,
    },
  ], [formatDateTime, getActionItems, renderProgress, renderStatusBadge]);

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

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
            <p className="text-sm text-slate-500 dark:text-zinc-400">
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
                <ResponsiveDrawerContent className="md:hidden">
                  <ResponsiveDrawerHeader>
                    <ResponsiveDrawerTitle>Filters</ResponsiveDrawerTitle>
                  </ResponsiveDrawerHeader>
                  <div className="px-4 pb-4">{filtersPanel}</div>
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

        {loading ? (
          <div className="mt-6">
            {!isHydrated ? (
              <></>
            ) : isMobile ? (
              <MobileSkeletonCards />
            ) : (
              <DesktopSkeletonRows />
            )}
          </div>
        ) : total === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
            No matches found. Try a different search.
          </div>
        ) : (
          <>
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
              <ScrollArea className="h-[60svh]" viewportRef={desktopScrollRef}>
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[50%]" />
                    <col className="w-[16%]" />
                    <col className="w-[22%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <TableBody className="text-sm">
                    {desktopVirtualizer.getVirtualItems()[0]?.start ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          style={{ height: desktopVirtualizer.getVirtualItems()[0].start }}
                        />
                      </TableRow>
                    ) : null}
                    {desktopVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = table.getRowModel().rows[virtualRow.index];
                      if (!row) return null;
                      const item = row.original;
                      return (
                        <React.Fragment key={row.id}>
                          <TableRow
                            data-index={virtualRow.index}
                            ref={desktopVirtualizer.measureElement}
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
                          {item.status === "rendering" ? (
                            <TableRow className="border-b border-slate-200 dark:border-white/10">
                              <TableCell colSpan={4} className="pb-4">
                                <StatRow show className="px-1">
                                  <Progress
                                    value={Math.round(
                                      (renderProgress[item.id]?.progress ?? 0) *
                                        100
                                    )}
                                    variant="amber"
                                  />
                                </StatRow>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                    {desktopVirtualizer.getVirtualItems().length ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          style={{
                            height:
                              desktopVirtualizer.getTotalSize() -
                              desktopVirtualizer.getVirtualItems()[
                                desktopVirtualizer.getVirtualItems().length - 1
                              ].end,
                          }}
                        />
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            )}

            {isMobile && (
            <div className="mt-6">
              <ScrollArea className="h-[50svh]" viewportRef={mobileScrollRef}>
                <div
                  className="relative"
                  style={{ height: mobileVirtualizer.getTotalSize() }}
                >
                  {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = items[virtualRow.index];
                    if (!item) return null;
                    return (
                      <div
                        key={item.id}
                        data-index={virtualRow.index}
                        ref={mobileVirtualizer.measureElement}
                        className="absolute left-0 top-0 w-full px-1 py-1"
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-1 gap-3">
                              <ImageWithSkeleton
                                src={`/api/content/${item.id}/asset?type=thumbnail&v=${encodeURIComponent(
                                  item.updatedAt
                                )}`}
                                alt={`${item.title} thumbnail`}
                                className="h-16 w-20 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                                wrapperClassName="h-16 w-20 rounded-md"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-semibold">
                                  {item.title}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-zinc-500">
                                  {formatDate(item.createdAt)}
                                </div>
                                <div className="mt-2">
                                  {renderStatusBadge(
                                    item.status,
                                    false,
                                    renderProgress[item.id]?.progress
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-start justify-end">
                              <ResponsiveActionMenu items={getActionItems(item)} />
                            </div>
                          </div>
                          <StatRow
                            show={item.status === "rendering"}
                            className="w-full"
                          >
                            <Progress
                              value={Math.round(
                                (renderProgress[item.id]?.progress ?? 0) * 100
                              )}
                              variant="amber"
                            />
                          </StatRow>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            )}
          </>
        )}

        <div
          className={cn(
            "mt-6 flex items-center justify-center transition-opacity",
            displayTotalPages > 1 || page > 1 ? "visible" : "invisible"
          )}
        >
          {displayTotalPages > 1 || page > 1 ? (
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
          ) : (
            <div className="h-10" />
          )}
        </div>
    </div>
  );
}
