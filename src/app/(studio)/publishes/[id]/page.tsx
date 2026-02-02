"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/components/route-transition";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Film, List, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table } from "@/components/ui/table";
import { ResponsiveActionMenu } from "@/components/responsive-action-menu";
import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
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
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getProviderDefinition } from "@/lib/publishing/providers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type PublishRecord = {
  id: string;
  renderId: string;
  provider: string;
  providerAssetId: string;
  status: string;
  metadata: string | null;
  error?: string | null;
  updatedAt?: number | string | Date | null;
  createdAt?: number | string | Date | null;
};

type PublishListResponse = {
  publishes: PublishRecord[];
};

type PublishListState = {
  page: number;
  limit: number;
  total: number;
  items: PublishRecord[];
};

const formatDateTime = (value?: number | string | Date | null) => {
  if (!value) return "—";
  const date =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
        ? new Date(value)
        : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseMetadataTitle = (metadata: string | null) => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { title?: string };
    return parsed.title ?? null;
  } catch {
    return null;
  }
};

const getProviderUrl = (provider: string, providerAssetId: string) => {
  if (!providerAssetId) return null;
  const definition = getProviderDefinition(provider);
  if (!definition?.getAssetUrl) return null;
  return definition.getAssetUrl(providerAssetId);
};

type ProviderSectionProps = {
  provider: string;
  items: PublishRecord[];
  isMobile: boolean;
  contentId: string;
  onViewError: (item: PublishRecord) => void;
};

const ProviderSection = ({
  provider,
  items,
  isMobile,
  contentId,
  onViewError,
}: ProviderSectionProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (isMobile ? 132 : 82),
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? index,
  });
  const definition = getProviderDefinition(provider);
  const label = definition?.label ?? (provider || "unknown");
  const ProviderIcon = definition?.icon ?? Radio;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"
    >
      <CollapsibleTrigger
        title={label}
        description={`${items.length} publishes`}
        icon={ProviderIcon}
        className="px-2 pb-3"
      />
      <CollapsibleContent>
        {isMobile ? (
        <ScrollArea className="h-[40svh]" viewportRef={scrollRef}>
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;
              const title = parseMetadataTitle(item.metadata) ?? "Untitled publish";
              const providerUrl = getProviderUrl(item.provider, item.providerAssetId);
              return (
                <div
                  key={item.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full px-1 py-1"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-16 w-20 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                          <Radio className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{title}</div>
                          <div className="text-xs text-slate-500 dark:text-zinc-500">
                            Updated: {formatDateTime(item.updatedAt)}
                          </div>
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {item.status}
                          </div>
                        </div>
                      </div>
                      <ResponsiveActionMenu
                        triggerClassName="h-9"
                        items={[
                          ...(item.status === "failed"
                            ? [
                                {
                                  label: "View error",
                                  icon: ShieldCheck,
                                  onSelect: () => onViewError(item),
                                },
                              ]
                            : []),
                          ...(providerUrl
                            ? [
                                {
                                  label: "Open in provider",
                                  icon: ExternalLink,
                                  href: providerUrl,
                                },
                              ]
                            : []),
                          {
                            label: "View render",
                            icon: Film,
                            href: `/renders/${contentId}`,
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
        <ScrollArea className="h-[45svh]" viewportRef={scrollRef}>
          <Table className="w-full table-fixed">
            <colgroup>
              <col className="w-[50%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                <th className="py-3">Publish</th>
                <th>Status</th>
                <th>Updated</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {virtualizer.getVirtualItems()[0]?.start ? (
                <tr>
                  <td colSpan={4} style={{ height: virtualizer.getVirtualItems()[0].start }} />
                </tr>
              ) : null}
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index];
                if (!item) return null;
                const title = parseMetadataTitle(item.metadata) ?? "Untitled publish";
                const providerUrl = getProviderUrl(item.provider, item.providerAssetId);
                return (
                  <tr
                    key={item.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="border-t border-slate-200 dark:border-white/10"
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-16 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                          <Radio className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{title}</div>
                          <div className="text-xs text-slate-500 dark:text-zinc-500">
                            Render: {item.renderId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-600 dark:text-zinc-300">
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {item.status}
                      </span>
                    </td>
                    <td className="text-slate-600 dark:text-zinc-300">
                      {formatDateTime(item.updatedAt ?? item.createdAt)}
                    </td>
                    <td className="text-center">
                      <ResponsiveActionMenu
                        triggerClassName="h-9"
                        items={[
                          ...(item.status === "failed"
                            ? [
                                {
                                  label: "View error",
                                  icon: ShieldCheck,
                                  onSelect: () => onViewError(item),
                                },
                              ]
                            : []),
                          ...(providerUrl
                            ? [
                                {
                                  label: "Open in provider",
                                  icon: ExternalLink,
                                  href: providerUrl,
                                },
                              ]
                            : []),
                          {
                            label: "View render",
                            icon: Film,
                            href: `/renders/${contentId}`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {virtualizer.getVirtualItems().length ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      height:
                        virtualizer.getTotalSize() -
                        virtualizer.getVirtualItems()[
                          virtualizer.getVirtualItems().length - 1
                        ].end,
                    }}
                  />
                </tr>
              ) : null}
            </tbody>
          </Table>
        </ScrollArea>
      )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function PublishesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [page, setPage] = useState(1);
  const limit = 20;
  const [data, setData] = useState<PublishListState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const isMobile = useIsMobile();
  const items = useMemo(() => data?.items ?? [], [data]);
  const [errorPublish, setErrorPublish] = useState<PublishRecord | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, PublishRecord[]>();
    items.forEach((item) => {
      const key = item.provider || "unknown";
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });
    return Array.from(map.entries()).map(([provider, providerItems]) => ({
      provider,
      items: providerItems,
    }));
  }, [items]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limit));
  }, [data]);
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
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/content/${id}/publishes`);
        if (!response.ok) {
          throw new Error("Failed to load publishes.");
        }
        const payload = (await response.json()) as PublishListResponse;
        const all = payload.publishes ?? [];
        const total = all.length;
        const start = (page - 1) * limit;
        const paged = all.slice(start, start + limit);
        if (!cancelled) {
          setData({ page, limit, total, items: paged });
        }
      } catch (error) {
        if (!cancelled) {
          setData({ page, limit, total: 0, items: [] });
          const message = error instanceof Error ? error.message : "Failed to load publishes.";
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, page]);

  const DesktopSkeletonRows = () => (
    <Table className="-mb-12">
      <thead>
        <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
          <th className="py-3">Publish</th>
          <th>Status</th>
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
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-3 w-28" />
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
      <ResponsiveDrawer
        open={Boolean(errorPublish)}
        onOpenChange={(open) => {
          if (!open) setErrorPublish(null);
        }}
      >
        <ResponsiveDrawerContent className="w-full sm:max-w-xl">
          <ResponsiveDrawerHeader>
            <ResponsiveDrawerTitle>Publish error</ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription>
              {errorPublish?.metadata
                ? parseMetadataTitle(errorPublish.metadata) ?? "Publish error details"
                : "Publish error details"}
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>
          <div className="px-4 pb-6 text-sm text-slate-700 dark:text-zinc-200">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="font-semibold text-slate-900 dark:text-white">
                {errorPublish?.status ?? "failed"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-zinc-200">
                {errorPublish?.error ?? "No error details were recorded."}
              </p>
            </div>
          </div>
        </ResponsiveDrawerContent>
      </ResponsiveDrawer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Publishes</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Track publish status and provider details for this video.
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
      ) : data && data.items.length > 0 ? (
        <div className="mt-2">
          <div className="space-y-4">
            {grouped.map((group) => (
              <ProviderSection
                key={group.provider}
                provider={group.provider}
                items={group.items}
                isMobile={isMobile}
                contentId={id ?? ""}
                onViewError={setErrorPublish}
              />
            ))}
          </div>
          <div
            className={cn(
              "mt-6 flex items-center justify-center transition-opacity",
              totalPages > 1 || page > 1 ? "visible" : "invisible"
            )}
          >
            {totalPages > 1 || page > 1 ? (
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
            ) : (
              <div className="h-10" />
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
          No publishes yet. Create a publish from the library page.
        </div>
      )}
    </div>
  );
}
