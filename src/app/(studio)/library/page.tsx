"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { Progress } from "@/components/ui/progress";
import { StatRow } from "@/components/ui/stat-row";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useContentList, type ContentItem } from "../_components/use-content-list";
import { useRenderProgress } from "../_components/use-render-progress";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import { ResponsiveActionMenu } from "@/components/responsive-action-menu";
import { PublishDrawer } from "@/components/publish-drawer";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  Eye,
  Film,
  Loader2,
  Play,
  Radio,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import React from "react";

export default function LibraryPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [page, setPage] = useState(1);
  const limit = 20;
  const { items, loading, refresh, total } = useContentList({
    query: debouncedQuery,
    page,
    limit,
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
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value)
    );
  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
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
  /* eslint-disable react-hooks/incompatible-library */
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
  /* eslint-enable react-hooks/incompatible-library */
  const getActionItems = (item: ContentItem) => [
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
          {
            label: "View Publishes",
            icon: Radio,
            href: `/publishes/${item.id}`,
          },
          { type: "separator" as const },

        ]
      : []),
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
  ];


  const handleRender = async (id: string) => {
    setRenderingId(id);
    setError(null);
    const response = await fetch(`/api/content/${id}/render`, { method: "POST" });

    if (!response.ok) {
      setError("Render failed. Please check server logs.");
      toast.error("Render failed. Please check server logs.");
    } else {
      toast.message("Render started.");
    }

    await refresh();
    setRenderingId(null);
  };

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

  const handleDelete = async (id: string, keepRenders?: boolean) => {
    setError(null);
    const params = new URLSearchParams();
    if (keepRenders) {
      params.set("keepRenders", "1");
    }
    const query = params.toString();
    const response = await fetch(`/api/content/${id}${query ? `?${query}` : ""}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Delete failed. Please try again.");
      toast.error("Delete failed. Please try again.");
    } else {
      toast.success("Item deleted.");
    }

    await refresh();
  };

  const getStatusMeta = (status: string) => {
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
  };

  const renderStatusBadge = (
    status: string,
    showLabel: boolean,
    progress?: number
  ) => {
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
  };

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
            <Input
              placeholder="Search by title, status, or id..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="w-full sm:w-72"
            />
            {total >= 0 && query && (
              <span className="text-xs text-slate-500 dark:text-zinc-500">
                Showing {items.length} of {total}
              </span>
            )}

          </div>
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-200">
              {error}
            </div>
          )}
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
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                      <th className="py-3">Project</th>
                      <th>Status</th>
                      <th>Settings</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
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
                  <tbody className="text-sm">
                    {desktopVirtualizer.getVirtualItems()[0]?.start ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{ height: desktopVirtualizer.getVirtualItems()[0].start }}
                        />
                      </tr>
                    ) : null}
                    {desktopVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = items[virtualRow.index];
                      if (!item) return null;
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            data-index={virtualRow.index}
                            ref={desktopVirtualizer.measureElement}
                            className="border-t border-slate-200 dark:border-white/10"
                          >
                            <td className="py-4">
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
                            </td>
                            <td>
                              {renderStatusBadge(
                                item.status,
                                true,
                                renderProgress[item.id]?.progress
                              )}
                            </td>
                            <td>
                              <div className="text-xs text-slate-500 dark:text-zinc-400">
                                {item.segmentDurationSeconds}s segments /{" "}
                                {item.fadeDurationSeconds}s fade
                              </div>
                              <div className="text-xs text-slate-500 dark:text-zinc-500">
                                {item.width}x{item.height} @ {item.fps}fps
                              </div>
                            </td>
                            <td className="text-center">
                              <div className="flex flex-wrap justify-center gap-2">
                                <ResponsiveActionMenu items={getActionItems(item)} />
                              </div>
                            </td>
                          </tr>
                          {item.status === "rendering" ? (
                            <tr className="border-b border-slate-200 dark:border-white/10">
                              <td colSpan={4} className="pb-4">
                                <StatRow show className="px-1">
                                  <Progress
                                    value={Math.round(
                                      (renderProgress[item.id]?.progress ?? 0) *
                                        100
                                    )}
                                    variant="amber"
                                  />
                                </StatRow>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                    {desktopVirtualizer.getVirtualItems().length ? (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            height:
                              desktopVirtualizer.getTotalSize() -
                              desktopVirtualizer.getVirtualItems()[
                                desktopVirtualizer.getVirtualItems().length - 1
                              ].end,
                          }}
                        />
                      </tr>
                    ) : null}
                  </tbody>
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
