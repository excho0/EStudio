"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/components/navigation/route-transition";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  Film,
  List,
  Loader2,
  Radio,
  ShieldCheck,
  Trash2,
  RefreshCwIcon,
  CircleX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table } from "@/components/ui/table";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import { ResponsiveActionMenu } from "@/components/controls/responsive-action-menu";
import type { ActionItem } from "@/components/controls/responsive-action-menu";
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
import { cn } from "@/lib/shared/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import {
  optimisticallyDeletePublishRecord,
  rollbackOptimisticQueryUpdate,
  reconcileQuery,
  updatePublishListRecord,
} from "@/lib/http/query-cache";
import { sdk } from "@/lib/sdk";
import { getProviderDefinition } from "@/lib/publishing/providers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useContentPublishes } from "@/hooks/use-content";
import { useProfileConnections } from "@/hooks/use-profile";
import type { PublishRecord, ProviderSectionProps, StudioPublishMetadata } from "@/types";
import { syncContentQueries } from "@/lib/http/query-sync";

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

const parseMetadata = (metadata: string | null): StudioPublishMetadata | null => {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as StudioPublishMetadata;
  } catch {
    return null;
  }
};

const getMetadataTitle = (metadata: string | null) =>
  parseMetadata(metadata)?.title ?? null;

const getMetadataThumbnail = (metadata: string | null) =>
  parseMetadata(metadata)?.thumbnailUrl ?? null;

const getProviderUrl = (provider: string, providerAssetId: string | null) => {
  if (!providerAssetId) return null;
  const definition = getProviderDefinition(provider);
  if (!definition?.getAssetUrl) return null;
  return definition.getAssetUrl(providerAssetId);
};

const DesktopSkeletonRows = () => (
  <Table className="-mb-12">
    <thead>
      <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
        <th className="py-3">Publish</th>
        <th>Status</th>
        <th>Details</th>
        <th className="text-right">Actions</th>
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

const getPublishStatusBadge = (status?: string | null) => {
  const value = status ?? "unknown";
  switch (value) {
    case "queued":
      return {
        label: "Queued",
        variant: "blue" as const,
        icon: Loader2,
        iconClassName: "animate-spin",
      };
    case "publishing":
      return {
        label: "Publishing",
        variant: "blue" as const,
        icon: Loader2,
        iconClassName: "animate-spin",
      };
    case "published":
      return { label: "Published", variant: "green" as const, icon: CheckCircle };
    case "published_with_warning":
      return { label: "Published (warn)", variant: "yellow" as const, icon: AlertTriangle };
    case "failed":
      return { label: "Failed", variant: "destructive" as const, icon: AlertTriangle };
    case "draft":
      return { label: "Draft", variant: "secondary" as const, icon: ShieldCheck };
    case "deleted":
      return { label: "Deleted", variant: "outline" as const, icon: Trash2 };
    default:
      return { label: value, variant: "outline" as const, icon: ShieldCheck };
  }
};

const ProviderSection = ({
  provider,
  items,
  isMobile,
  contentId,
  connectedAccountIds,
  onRetry,
  onViewError,
  onDelete,
}: ProviderSectionProps & {
  connectedAccountIds: Set<string>;
  onRetry: (publishId: string) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(true);
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
  const renderActionMenu = (item: PublishRecord, providerUrl: string | null) => {
    const isConnected = Boolean(
      item.providerAccountId && connectedAccountIds.has(item.providerAccountId)
    );
    const hasProviderAsset = Boolean(item.providerAssetId);
    const supportsDeleteAsset = Boolean(
      definition?.capabilities?.supportsDeleteAsset
    );
    const canRemoveRecord = item.status === "deleted";
    const canDeleteFromProvider =
      isConnected && hasProviderAsset && supportsDeleteAsset && item.status !== "deleted";
    const items: ActionItem[] = [
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
      ...((item.status === "failed" || isConnected)
        ? [{ type: "separator" as const }]
        : []),
      ...(item.status === "failed" || item.status === "published_with_warning"
        ? [
            {
              label: `View ${item.status === "failed" ? "error" : "warning"} `,
              icon: item.status === "failed" ? CircleX : AlertTriangle,
              onSelect: () => onViewError(item),
            },
          ]
        : []),
      ...(item.status === "failed"
        ? [
            {
              label: "Retry publish",
              icon: RefreshCwIcon,
              onSelect: () => onRetry(item.id),
            },
          ]
        : []),
      ...(canDeleteFromProvider || canRemoveRecord
        ? [
            {
              type: "confirm" as const,
              label: canRemoveRecord ? "Remove record" : `Delete from ${label}`,
              icon: Trash2,
              description: canRemoveRecord
                ? "This removes the local publish record."
                : `This deletes the published asset from ${label} and then removes the local record.`,
              destructive: true,
              onConfirm: () => onDelete(item),
            },
          ]
        : []),
      ...((!canRemoveRecord || canDeleteFromProvider)
        ? [
            {
              type: "confirm" as const,
              label: "Remove record",
              icon: Trash2,
              description:
                "This removes the local publish record only and leaves the provider asset untouched.",
              destructive: true,
              onConfirm: () => onDelete(item, { localOnly: true }),
            },
          ]
        : []),
    ];
    return <ResponsiveActionMenu triggerClassName="h-9" items={items} />;
  };

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
          <ScrollArea 
            className="h-[clamp(20rem,56svh,68svh)]"
            viewportRef={scrollRef}
          >          
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;
              const title = getMetadataTitle(item.metadata) ?? "Untitled publish";
              const thumbnailUrl = getMetadataThumbnail(item.metadata);
              const providerUrl = getProviderUrl(
                item.provider,
                item.providerAssetId
              );
              const statusBadge = getPublishStatusBadge(item.status);
              const StatusIcon = statusBadge.icon;
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
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                          {thumbnailUrl ? (
                            <ImageWithSkeleton
                              src={thumbnailUrl}
                              alt={title}
                              className="h-full w-full object-cover"
                              wrapperClassName="h-full w-full"
                            />
                          ) : (
                            <Radio className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{title}</div>
                          <div className="truncate text-xs text-slate-500 dark:text-zinc-500">
                            Updated: {formatDateTime(item.updatedAt)}
                          </div>
                          <Badge
                            variant={statusBadge.variant}
                            className="mt-2"
                          >
                            <StatusIcon
                              className={cn(
                                "size-4 h-4 w-4 flex shrink-0",
                                statusBadge.iconClassName
                              )}
                            />
                            {statusBadge.label}
                          </Badge>
                        </div>
                      </div>
                      {renderActionMenu(item, providerUrl)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea
          className="h-[clamp(20rem,56svh,68svh)]"
          viewportRef={scrollRef}
        >
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
                const title = getMetadataTitle(item.metadata) ?? "Untitled publish";
                const thumbnailUrl = getMetadataThumbnail(item.metadata);
                const providerUrl = getProviderUrl(
                  item.provider,
                  item.providerAssetId
                );
                const statusBadge = getPublishStatusBadge(item.status);
                const StatusIcon = statusBadge.icon;
                return (
                  <tr
                    key={item.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="border-t border-slate-200 dark:border-white/10"
                  >
                    <td className="py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                          {thumbnailUrl ? (
                            <ImageWithSkeleton
                              src={thumbnailUrl}
                              alt={title}
                              className="h-full w-full object-cover"
                              wrapperClassName="h-full w-full"
                            />
                          ) : (
                            <Radio className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{title}</div>
                          <div className="text-xs text-slate-500 dark:text-zinc-500">
                            Render: {item.renderId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-600 dark:text-zinc-300">
                      <Badge variant={statusBadge.variant} className="text-md">
                        <StatusIcon
                          className={cn(
                            "size-4 h-4 w-4 flex shrink-0",
                            statusBadge.iconClassName
                          )}
                        />
                        {statusBadge.label}
                      </Badge>
                    </td>
                    <td className="text-slate-600 dark:text-zinc-300">
                      {formatDateTime(item.updatedAt ?? item.createdAt)}
                    </td>
                    <td className="text-center">
                      {renderActionMenu(item, providerUrl)}
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
  const isHydrated = true;
  const isMobile = useIsMobile();
  const [errorPublish, setErrorPublish] = useState<PublishRecord | null>(null);
  const queryClient = useQueryClient();

  const publishQueryKey = useMemo(() => queryKeys.publishes(id), [id]);
  const connectionsQuery = useProfileConnections();
  const connectedAccountIds = useMemo(() => {
    const connections = connectionsQuery.data?.connections ?? [];
    return new Set<string>(
      connections
        .map((connection) => connection.providerAccountId)
        .filter((value: string | null): value is string => Boolean(value))
    );
  }, [connectionsQuery.data]);

  const { data, isLoading, isFetching, error } = useContentPublishes({ id });

  const deleteMutation = useMutation({
    mutationFn: async ({
      publishId,
      localOnly,
    }: {
      publishId: string;
      localOnly?: boolean;
    }) => {
      if (!id) return;
      await sdk.content.deletePublish(id, publishId, { localOnly });
    },
    onMutate: async (variables) =>
      optimisticallyDeletePublishRecord({
        queryClient,
        queryKey: publishQueryKey,
        publishId: variables.publishId,
        localOnly: variables.localOnly,
      }),
    onError: (_error, _variables, context) => {
      rollbackOptimisticQueryUpdate({ queryClient, queryKey: publishQueryKey, context });
    },
    onSettled: () => {
      void reconcileQuery({ queryClient, queryKey: publishQueryKey });
      void syncContentQueries(queryClient);
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (publishId: string) => {
      if (!id) return;
      await sdk.content.retryPublish(id, publishId);
    },
    onSuccess: () => {
      updatePublishListRecord({
        queryClient,
        queryKey: publishQueryKey,
        updater: (publish) =>
          publish.status === "failed" || publish.status === "published_with_warning"
            ? { ...publish, status: "queued", error: null }
            : publish,
      });
      void reconcileQuery({ queryClient, queryKey: publishQueryKey });
    },
  });

  const allItems = useMemo<PublishRecord[]>(() => data?.publishes ?? [], [data]);
  const items = useMemo<PublishRecord[]>(() => {
    const start = (page - 1) * limit;
    return allItems.slice(start, start + limit);
  }, [allItems, page, limit]);
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isFetching && !!data;

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
    if (!allItems.length) return 1;
    return Math.max(1, Math.ceil(allItems.length / limit));
  }, [allItems, limit]);
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
    if (!error) return;
    const message = error.message || "Failed to load publishes.";
    toast.error(message);
  }, [error]);

  const handleDelete = async (
    item: PublishRecord,
    options?: { localOnly?: boolean }
  ) => {
    if (!id) return;
    try {
      await toast.promise(
        deleteMutation.mutateAsync({
          publishId: item.id,
          localOnly: options?.localOnly,
        }),
        {
        loading:
          options?.localOnly || item.status === "deleted"
            ? "Removing publish record..."
            : "Deleting publish...",
        success: () => {
          return options?.localOnly || item.status === "deleted"
            ? "Publish removed."
            : "Publish deleted from provider.";
        },
        error: (error) =>
          error instanceof Error ? error.message : "Failed to delete publish.",
      });
    } catch {
      // errors are surfaced via toast.promise
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ResponsiveDrawer
        open={Boolean(errorPublish)}
        onOpenChange={(open) => {
          if (!open) setErrorPublish(null);
        }}
        className="w-full"
      >
        <ResponsiveDrawerHeader>
          <ResponsiveDrawerTitle>Publish {errorPublish?.status === "failed" ? "Error" : "Warning"}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription>
            {errorPublish?.metadata
              ? getMetadataTitle(errorPublish.metadata) ?? "Publish error details"
              : "Publish error details"}
          </ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerContent className="px-4 pb-6 text-sm text-slate-700 dark:text-zinc-200">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="font-semibold text-slate-900 dark:text-white">
                {errorPublish?.status ?? "failed"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-zinc-200">
                {errorPublish?.error ?? "No error details were recorded."}
              </p>
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
      ) : isInitialLoading ? (
        isMobile ? (
          <MobileSkeletonCards />
        ) : (
          <DesktopSkeletonRows />
        )
      ) : data && data.publishes.length > 0 ? (
        <div className="mt-2">
          <div className="space-y-4">
            {grouped.map((group) => (
              <ProviderSection
                key={group.provider}
                provider={group.provider}
                items={group.items}
                isMobile={isMobile}
                contentId={id ?? ""}
                connectedAccountIds={connectedAccountIds}
                onRetry={(publishId) => retryMutation.mutate(publishId)}
                onViewError={setErrorPublish}
                onDelete={handleDelete}
              />
            ))}
          </div>
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
                      aria-disabled={!canGoBack || isRefreshing}
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
                          aria-disabled={isRefreshing}
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
                      aria-disabled={!canGoNext || isRefreshing}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
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
