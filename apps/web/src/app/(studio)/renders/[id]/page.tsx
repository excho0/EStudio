"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/components/navigation/route-transition";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Eye, Film, List, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table } from "@/components/ui/table";
import { ResponsiveActionMenu } from "@/components/controls/responsive-action-menu";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
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
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/shared/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { RenderListResponse } from "@/types";

type RenderPreviewItem = {
  name: string;
  assetUrl: string;
  size: number;
  mtimeMs: number;
  thumbnailUrl?: string | null;
};

const RenderThumbnail = ({
  item,
  className,
  iconClassName,
}: {
  item: RenderPreviewItem;
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
    <div className={cn(className, "flex items-center justify-center")}>
      <Film className={iconClassName} />
    </div>
  );
};

const DesktopSkeletonRows = () => (
  <Table className="-mb-12">
    <thead>
      <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
        <th className="py-3">Render</th>
        <th>Size</th>
        <th>Updated</th>
        <th className="text-right">Action</th>
      </tr>
    </thead>
    <tbody className="text-sm">
      {Array.from({ length: 8 }).map((_, index) => (
        <tr
          key={`skeleton-row-${index}`}
          className="border-t border-slate-200 dark:border-white/10"
        >
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

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDateTime = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function RendersPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;

  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<RenderPreviewItem | null>(null);
  const limit = 20;
  const isHydrated = true;
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const rendersQuery = useQuery<RenderListResponse>({
    queryKey: queryKeys.contentRenders(id, page, limit),
    enabled: Boolean(id),
    staleTime: 15_000,
    queryFn: async () => {
      if (!id) {
        return { page, limit, total: 0, items: [] };
      }
      return sdk.content.renders(id, page, limit);
    },
  });
  const items = rendersQuery.data?.items ?? [];
  const loading = rendersQuery.isLoading || rendersQuery.isFetching;
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);

  const desktopVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => 76,
    overscan: 10,
    getItemKey: (index) => items[index]?.name ?? index,
  });
  const mobileVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => mobileScrollRef.current,
    estimateSize: () => 120,
    overscan: 10,
    getItemKey: (index) => items[index]?.name ?? index,
  });

  const totalPages = useMemo(() => {
    if (!rendersQuery.data) return 1;
    return Math.max(1, Math.ceil(rendersQuery.data.total / rendersQuery.data.limit));
  }, [rendersQuery.data]);
  const canGoBack = page > 1;
  const canGoNext = page < totalPages;

  const getPageItems = () => {
    if (totalPages <= 1) return [];
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const pages = new Set<number>([
      1,
      totalPages,
      page,
      Math.max(1, page - 1),
      Math.min(totalPages, page + 1),
    ]);
    return Array.from(pages).sort((a, b) => a - b);
  };

  useEffect(() => {
    if (!rendersQuery.error) return;
    const message =
      rendersQuery.error instanceof Error
        ? rendersQuery.error.message
        : "Failed to load renders.";
    toast.error(message);
  }, [rendersQuery.error]);

  const deleteRenderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!id) return;
      await sdk.content.deleteRender(id, name);
      return name;
    },
    onSuccess: (name) => {
      if (!id || !name) return;
      queryClient.setQueryData<RenderListResponse | undefined>(
        queryKeys.contentRenders(id, page, limit),
        (current) => {
          if (!current) return current;
          const nextItems = current.items.filter((item) => item.name !== name);
          return {
            ...current,
            total: Math.max(0, current.total - 1),
            items: nextItems,
          };
        }
      );
      toast.success("Render deleted.");
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete render.";
      toast.error(message);
    },
  });

  const handleDeleteRender = async (name: string) => {
    await deleteRenderMutation.mutateAsync(name);
  };

  useEffect(() => {
    if (!id) return;
    const previewName = searchParams?.get("preview")?.trim();
    if (!previewName) {
      if (previewItem) {
        setPreviewItem(null);
      }
      return;
    }
    const matchedItem = items.find((item) => item.name === previewName);
    if (!matchedItem) return;
    if (previewItem?.name === matchedItem.name) return;
    setPreviewItem(matchedItem);
  }, [id, items, previewItem, searchParams]);

  const clearPreviewQueryParam = () => {
    if (!id) return;
    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.delete("preview");
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `/renders/${id}?${nextQuery}` : `/renders/${id}`, {
      scroll: false,
    });
  };

  const openPreview = (item: RenderPreviewItem) => {
    setPreviewItem(item);
    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.set("preview", item.name);
    router.replace(`/renders/${id}?${nextSearchParams.toString()}`, { scroll: false });
  };

  const previewName = previewItem?.name ?? "";
  const previewMeta = previewItem
    ? `${formatBytes(previewItem.size)} · ${formatDateTime(previewItem.mtimeMs)}`
    : "";
  const previewAssetUrl = previewItem?.assetUrl ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Renders</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 hidden lg:block">
              Review and download rendered outputs for this video.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/edit/${id}`}>
            <List className="h-4 w-4" />
            <span>Go to details</span>
          </Link>
        </Button>
      </div>

      {!isHydrated ? (
        <></>
      ) : loading ? (
        isMobile ? (
          <MobileSkeletonCards />
        ) : (
          <DesktopSkeletonRows />
        )
      ) : rendersQuery.data && rendersQuery.data.items.length > 0 ? (
        <div className="mt-2">
          {isMobile ? (
            <ScrollArea 
              className="h-[clamp(20rem,56svh,68svh)]"
              viewportRef={mobileScrollRef}
            >   
              <div
                className="relative"
                style={{ height: mobileVirtualizer.getTotalSize() }}
              >
                {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = items[virtualRow.index];
                  if (!item) return null;
                  return (
                    <div
                      key={item.name}
                      data-index={virtualRow.index}
                      ref={mobileVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full px-1 py-1"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <RenderThumbnail
                              item={item}
                              className="h-16 w-20 rounded-md border border-slate-200 bg-slate-50 object-cover text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                              iconClassName="h-5 w-5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground truncate">{item.name}</div>
                              <div className="truncate text-xs text-slate-500 dark:text-zinc-500">
                                {formatBytes(item.size)} · {formatDateTime(item.mtimeMs)}
                              </div>
                            </div>
                          </div>
                          <ResponsiveActionMenu
                            triggerClassName="h-9"
                            items={[
                              {
                                label: "Preview",
                                icon: Eye,
                                onSelect: () => openPreview(item),
                              },
                              {
                                label: "Download",
                                icon: Download,
                                href: item.assetUrl,
                              },
                              { type: "separator" },
                              {
                                type: "confirm",
                                label: "Delete",
                                icon: Trash2,
                                description:
                                  "This will remove the rendered file from local storage. This action cannot be undone.",
                                onConfirm: () => handleDeleteRender(item.name),
                                destructive: true,
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[55%]" />
                    <col className="w-[15%]" />
                    <col className="w-[20%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                      <th className="py-3">Render</th>
                      <th>Size</th>
                      <th>Updated</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                </Table>
              </div>
              <ScrollArea 
                className="h-[clamp(20rem,56svh,68svh)]"
                viewportRef={desktopScrollRef}
              >   
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[55%]" />
                    <col className="w-[15%]" />
                    <col className="w-[20%]" />
                    <col className="w-[10%]" />
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
                          key={item.name}
                          data-index={virtualRow.index}
                          ref={desktopVirtualizer.measureElement}
                          className="border-t border-slate-200 dark:border-white/10"
                        >
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                            <RenderThumbnail
                              item={item}
                              className="mx-1 h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                              iconClassName="h-4 w-4"
                            />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-slate-600 dark:text-zinc-300">
                            {formatBytes(item.size)}
                          </td>
                          <td className="text-slate-600 dark:text-zinc-300">
                            {formatDateTime(item.mtimeMs)}
                          </td>
                        <td className="text-center">
                          <ResponsiveActionMenu
                            triggerClassName="h-9"
                            items={[
                              {
                                label: "Preview",
                                icon: Eye,
                                onSelect: () => openPreview(item),
                              },
                              {
                                label: "Download",
                                icon: Download,
                                href: item.assetUrl,
                              },
                              { type: "separator" },
                              {
                                type: "confirm",
                                label: "Delete",
                                icon: Trash2,
                                description:
                                  "This will remove the rendered file from local storage. This action cannot be undone.",
                                onConfirm: () => handleDeleteRender(item.name),
                                destructive: true,
                              },
                            ]}
                          />
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
            </>
          )}
          <div
            className={cn(
              "flex items-center justify-center transition-opacity",
              totalPages > 1 || page > 1 ? "visible" : "invisible"
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
                        setPage((current) => Math.min(totalPages, current + 1))
                      }
                      aria-disabled={!canGoNext || loading}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
          No renders yet. Run a render from the library page.
        </div>
      )}

      <ResponsiveDrawer
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
            clearPreviewQueryParam();
          }
        }}
        className="flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden border-0 bg-background p-0 shadow-2xl sm:h-auto sm:max-h-[min(92dvh,980px)] sm:border md:w-[min(90vw,1320px)] md:max-w-[min(90vw,1320px)] lg:w-[min(86vw,1440px)] lg:max-w-[min(86vw,1440px)]"
      >
        <ResponsiveDrawerHeader className="shrink-0 border-b border-slate-200 px-4 py-4 text-left dark:border-white/10 sm:px-5">
          <ResponsiveDrawerTitle className="text-lg font-semibold break-all sm:break-normal">
            {previewName}
          </ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            {previewMeta}
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <ResponsiveDrawerContent className="min-h-0 overflow-y-auto px-0 pb-0 pt-0 sm:px-5 sm:pb-5 sm:pt-3">
          <div className="mx-auto flex min-h-full w-full items-center justify-center sm:max-w-[min(100%,calc(92dvh*1.777))]">
            <div className="w-full overflow-hidden sm:rounded-2xl sm:border ">
              <video
                src={previewAssetUrl || undefined}
                controls
                playsInline
                disablePictureInPicture
                preload="metadata"
                className="aspect-video h-auto max-h-[calc(100dvh-13.5rem)] w-full bg-black object-contain sm:max-h-[calc(92dvh-15rem)]"
              />
            </div>
          </div>
        </ResponsiveDrawerContent>

        <ResponsiveDrawerFooter className="w-full shrink-0 border-t border-slate-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:px-5">
          <Button asChild variant="outline" className="flex-1" disabled={!previewItem}>
            <a href={previewAssetUrl || undefined} download={Boolean(previewAssetUrl) || undefined}>
              <Download className="h-4 w-4" />
              <span>Download</span>
            </a>
          </Button>
          <Button asChild variant="secondary" className="flex-1" disabled={!previewItem}>
            <a href={previewAssetUrl || undefined} target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              <span>Open raw file</span>
            </a>
          </Button>
        </ResponsiveDrawerFooter>
      </ResponsiveDrawer>
    </div>
  );
}
