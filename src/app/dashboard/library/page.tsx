"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContentList, type ContentItem } from "../_components/use-content-list";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import { ResponsiveActionMenu } from "@/components/responsive-action-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function DashboardLibraryPage() {
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
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedVideoUrl = selected
    ? `/api/content/${selected.id}/asset?type=video`
    : null;
  const selectedAudioUrl = selected
    ? `/api/content/${selected.id}/asset?type=song`
    : null;
  const { blobUrl: selectedVideoBlobUrl, loading: selectedVideoLoading } =
    useMediaBlobUrl(selectedVideoUrl);
  const { blobUrl: selectedAudioBlobUrl, loading: selectedAudioLoading } =
    useMediaBlobUrl(selectedAudioUrl);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / limit)),
    [limit, total]
  );
  const canGoBack = page > 1;
  const canGoNext = page < totalPages;
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
      label: "Preview",
      icon: Eye,
      onSelect: () => setSelected(item),
    },
    {
      label: renderingId === item.id ? "Rendering..." : "Render",
      icon: Play,
      onSelect: () => handleRender(item.id),
      disabled: renderingId === item.id,
    },
    ...(item.renderPath
      ? [
          {
            label: "Download",
            icon: Download,
            href: `/api/content/${item.id}/asset?type=render`,
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
      onConfirm: () => handleDelete(item.id),
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

  const handleDelete = async (id: string) => {
    setError(null);
    const response = await fetch(`/api/content/${id}`, { method: "DELETE" });

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
      default:
        return {
          label: "Queued",
          icon: Play,
          className:
            "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-100",
        };
    }
  };

  const renderStatusBadge = (status: string, showLabel: boolean) => {
    const meta = getStatusMeta(status);
    const Icon = meta.icon;
    return (
      <Badge className={`inline-flex items-center gap-2 ${meta.className}`}>
        <Icon
          className={`h-4 w-4 shrink-0 ${
            status === "rendering" ? "animate-spin" : ""
          }`}
        />
        {showLabel ? (
          <span>{meta.label}</span>
        ) : (
          <span className="sr-only">{meta.label}</span>
        )}
      </Badge>
    );
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const DesktopSkeletonRows = () => (
    <Table>
      <thead>
        <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
          <th className="py-3">Project</th>
          <th>Status</th>
          <th>Settings</th>
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="text-sm">
        {Array.from({ length: 5 }).map((_, index) => (
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
          className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20"
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
                        <tr
                          key={item.id}
                          data-index={virtualRow.index}
                          ref={desktopVirtualizer.measureElement}
                          className="border-t border-slate-200 dark:border-white/10"
                        >
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/content/${item.id}/asset?type=thumbnail`}
                                alt={`${item.title} thumbnail`}
                                className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                              />
                              <div>
                                <div className="font-medium">{item.title}</div>
                                <div className="text-xs text-slate-500 dark:text-zinc-500">
                                  {new Date(item.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {renderStatusBadge(item.status, true)}
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
                        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                          <div className="flex flex-1 gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/content/${item.id}/asset?type=thumbnail`}
                              alt={`${item.title} thumbnail`}
                              className="h-16 w-20 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">
                                {item.title}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-zinc-500">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </div>
                              <div className="mt-2">
                                {renderStatusBadge(item.status, false)}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-start justify-end">
                            <ResponsiveActionMenu items={getActionItems(item)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!canGoBack}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500 dark:text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={!canGoNext}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "Preview"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
              {selectedVideoLoading || selectedAudioLoading || !selectedVideoBlobUrl ? (
                <Skeleton className="aspect-video w-full rounded-lg bg-slate-100 dark:bg-white/10" />
              ) : (
                <Player
                  component={ContentLoopComposition}
                  inputProps={{
                    title: selected.title,
                    videoSrc: selectedVideoBlobUrl,
                    audioSrc: selectedAudioBlobUrl ?? "",
                    segmentDurationSeconds: selected.segmentDurationSeconds,
                    fadeDurationSeconds: selected.fadeDurationSeconds,
                    videoDurationSeconds:
                      selected.videoDurationSeconds ?? selected.segmentDurationSeconds,
                  }}
                  durationInFrames={Math.max(
                    1,
                    Math.round(selected.songDurationSeconds * selected.fps)
                  )}
                  fps={selected.fps}
                  compositionWidth={selected.width}
                  compositionHeight={selected.height}
                  controls
                  style={{ width: "100%" }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
