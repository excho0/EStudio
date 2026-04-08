import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import type {
  ConnectionsResponse,
  ContentItem,
  ContentListResponse,
  PublishListResponse,
  PublishRecord,
  RenderListResponse,
} from "@/types";

export type OptimisticUpdateContext<T> = {
  previous: T | undefined;
};

export type MultiQueryOptimisticUpdateContext<T> = {
  previousEntries: Array<[QueryKey, T]>;
};

export const applyOptimisticQueryUpdate = async <T>(params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  updater: (current: T) => T;
}) => {
  const { queryClient, queryKey, updater } = params;
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<T>(queryKey);

  queryClient.setQueryData<T | undefined>(queryKey, (current) =>
    current ? updater(current) : current
  );

  return { previous } satisfies OptimisticUpdateContext<T>;
};

export const rollbackOptimisticQueryUpdate = <T>(params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  context?: OptimisticUpdateContext<T>;
}) => {
  const { queryClient, queryKey, context } = params;
  if (context?.previous !== undefined) {
    queryClient.setQueryData(queryKey, context.previous);
  }
};

export const rollbackMultiQueryOptimisticUpdate = <T>(params: {
  queryClient: QueryClient;
  context?: MultiQueryOptimisticUpdateContext<T>;
}) => {
  const { queryClient, context } = params;
  if (!context) return;

  context.previousEntries.forEach(([queryKey, previous]) => {
    queryClient.setQueryData(queryKey, previous);
  });
};

export const reconcileQuery = async (params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
}) => {
  const { queryClient, queryKey } = params;
  await queryClient.invalidateQueries({
    queryKey,
    exact: true,
    refetchType: "active",
  });
};

type ContentListQueryParams = {
  query?: string;
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
  sortDir?: string;
};

const parseContentListParams = (queryKey: QueryKey): ContentListQueryParams | null => {
  const raw = queryKey[1];
  if (!raw || typeof raw !== "object") return null;
  return raw as ContentListQueryParams;
};

const matchesContentListFilters = (
  item: ContentItem,
  queryParams: ContentListQueryParams | null
) => {
  const statusFilter = queryParams?.status ?? "all";
  const searchQuery = queryParams?.query?.trim().toLowerCase() ?? "";

  const matchesStatus = statusFilter === "all" || statusFilter === item.status;
  const matchesQuery =
    searchQuery.length === 0 || item.title.toLowerCase().includes(searchQuery);

  return matchesStatus && matchesQuery;
};

export const insertCreatedContentIntoCachedLists = (params: {
  queryClient: QueryClient;
  item: ContentItem;
}) => {
  const { queryClient, item } = params;
  const cachedLists = queryClient.getQueriesData<ContentListResponse>({
    queryKey: queryKeys.contentListBase,
  });

  cachedLists.forEach(([cacheKey, current]) => {
    if (!current) return;

    const queryParams = parseContentListParams(cacheKey);
    const pageNumber = queryParams?.page ?? current.page ?? 1;
    const sortBy = queryParams?.sortBy ?? "createdAt";
    const sortDir = queryParams?.sortDir ?? "desc";

    if (!matchesContentListFilters(item, queryParams)) {
      return;
    }

    const nextTotal = current.total + 1;
    if (pageNumber !== 1) {
      queryClient.setQueryData<ContentListResponse>(cacheKey, {
        ...current,
        total: nextTotal,
      });
      return;
    }

    const dedupedItems = current.items.filter((entry) => entry.id !== item.id);
    const nextItems =
      sortBy === "createdAt" && sortDir === "desc"
        ? [item, ...dedupedItems].slice(0, current.limit)
        : dedupedItems;

    queryClient.setQueryData<ContentListResponse>(cacheKey, {
      ...current,
      items: nextItems,
      total: nextTotal,
    });
  });
};

export const updateCachedContentLists = (params: {
  queryClient: QueryClient;
  updater: (item: ContentItem) => ContentItem;
}) => {
  const { queryClient, updater } = params;
  const cachedLists = queryClient.getQueriesData<ContentListResponse>({
    queryKey: queryKeys.contentListBase,
  });

  cachedLists.forEach(([cacheKey, current]) => {
    if (!current) return;
    queryClient.setQueryData<ContentListResponse>(cacheKey, {
      ...current,
      items: current.items.map((item) => updater(item)),
    });
  });
};

export const commitUpdatedContentToCaches = (params: {
  queryClient: QueryClient;
  item: ContentItem;
}) => {
  const { queryClient, item } = params;

  queryClient.setQueryData(queryKeys.contentItem(item.id), item);

  const cachedLists = queryClient.getQueriesData<ContentListResponse>({
    queryKey: queryKeys.contentListBase,
  });

  cachedLists.forEach(([cacheKey, current]) => {
    if (!current) return;

    const queryParams = parseContentListParams(cacheKey);
    const pageNumber = queryParams?.page ?? current.page ?? 1;
    const sortBy = queryParams?.sortBy ?? "createdAt";
    const sortDir = queryParams?.sortDir ?? "desc";
    const nextMatches = matchesContentListFilters(item, queryParams);
    const existingIndex = current.items.findIndex((entry) => entry.id === item.id);

    if (existingIndex >= 0 && nextMatches) {
      const nextItems = [...current.items];
      nextItems[existingIndex] = item;
      queryClient.setQueryData<ContentListResponse>(cacheKey, {
        ...current,
        items: nextItems,
      });
      return;
    }

    if (existingIndex >= 0 && !nextMatches) {
      queryClient.setQueryData<ContentListResponse>(cacheKey, {
        ...current,
        items: current.items.filter((entry) => entry.id !== item.id),
        total: Math.max(0, current.total - 1),
      });
      return;
    }

    if (existingIndex === -1 && nextMatches) {
      if (pageNumber !== 1) {
        queryClient.setQueryData<ContentListResponse>(cacheKey, {
          ...current,
          total: current.total + 1,
        });
        return;
      }

      const shouldPrepend = sortBy === "createdAt" && sortDir === "desc";
      if (!shouldPrepend) {
        queryClient.setQueryData<ContentListResponse>(cacheKey, {
          ...current,
          total: current.total + 1,
        });
        return;
      }

      queryClient.setQueryData<ContentListResponse>(cacheKey, {
        ...current,
        items: [item, ...current.items].slice(0, current.limit),
        total: current.total + 1,
      });
    }
  });
};

export const removeContentFromCachedLists = async (params: {
  queryClient: QueryClient;
  contentId: string;
}) => {
  const { queryClient, contentId } = params;
  await queryClient.cancelQueries({ queryKey: queryKeys.contentListBase });

  const cachedLists = queryClient.getQueriesData<ContentListResponse>({
    queryKey: queryKeys.contentListBase,
  });
  const previousEntries: Array<[QueryKey, ContentListResponse]> = [];

  cachedLists.forEach(([cacheKey, current]) => {
    if (!current) return;
    if (!current.items.some((item) => item.id === contentId)) return;

    previousEntries.push([cacheKey, current]);
    queryClient.setQueryData<ContentListResponse>(cacheKey, {
      ...current,
      items: current.items.filter((item) => item.id !== contentId),
      total: Math.max(0, current.total - 1),
    });
  });

  return { previousEntries } satisfies MultiQueryOptimisticUpdateContext<ContentListResponse>;
};

export const reconcileResourceFamily = async (params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
}) => {
  const { queryClient, queryKey } = params;
  await queryClient.invalidateQueries({
    queryKey,
    refetchType: "active",
  });
};

export const removeRenderFromCachedPages = (params: {
  queryClient: QueryClient;
  contentId: string;
  renderName: string;
}) => {
  const { queryClient, contentId, renderName } = params;
  const cachedPages = queryClient.getQueriesData<RenderListResponse>({
    queryKey: queryKeys.rendersBase,
  });

  cachedPages.forEach(([cacheKey, current]) => {
    if (!current || cacheKey[1] !== contentId) return;
    const nextItems = current.items.filter((item) => item.name !== renderName);
    if (nextItems.length === current.items.length) return;
    queryClient.setQueryData<RenderListResponse>(cacheKey, {
      ...current,
      total: Math.max(0, current.total - 1),
      items: nextItems,
    });
  });

  const simpleKey = queryKeys.contentRendersSimple(contentId);
  queryClient.setQueryData<{ name: string }[] | undefined>(simpleKey, (current) =>
    current ? current.filter((item) => item.name !== renderName) : current
  );
};

export const updatePublishListRecord = (params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  updater: (publish: PublishRecord) => PublishRecord | null;
}) => {
  const { queryClient, queryKey, updater } = params;
  queryClient.setQueryData<PublishListResponse | undefined>(queryKey, (current) => {
    if (!current) return current;
    const nextPublishes = current.publishes
      .map((publish) => updater(publish))
      .filter((publish): publish is PublishRecord => publish !== null);
    return {
      ...current,
      publishes: nextPublishes,
    };
  });
};

export const optimisticallyUnlinkProfileConnection = async (params: {
  queryClient: QueryClient;
  providerId: string;
}) =>
  applyOptimisticQueryUpdate<ConnectionsResponse>({
    queryClient: params.queryClient,
    queryKey: queryKeys.profileConnections,
    updater: (current) => ({
      ...current,
      connections: current.connections.filter(
        (connection) => connection.provider !== params.providerId
      ),
    }),
  });

export const optimisticallyDisconnectPublishProvider = async (params: {
  queryClient: QueryClient;
  providerId: string;
}) =>
  applyOptimisticQueryUpdate<{
    connected: boolean;
    needsReconnect: boolean;
    channel: unknown;
  }>({
    queryClient: params.queryClient,
    queryKey: queryKeys.publishProvider(params.providerId),
    updater: (current) => ({
      ...current,
      connected: false,
      needsReconnect: false,
      channel: null,
    }),
  });

export const optimisticallyDeletePublishRecord = async (params: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  publishId: string;
  localOnly?: boolean;
}) =>
  applyOptimisticQueryUpdate<PublishListResponse>({
    queryClient: params.queryClient,
    queryKey: params.queryKey,
    updater: (current) => ({
      ...current,
      publishes: params.localOnly
        ? current.publishes.filter((publish) => publish.id !== params.publishId)
        : current.publishes.map((publish) =>
            publish.id === params.publishId
              ? {
                  ...publish,
                  status: "deleted",
                  providerAssetId: null,
                  error: null,
                  updatedAt: new Date().toISOString(),
                }
              : publish
          ),
    }),
  });
