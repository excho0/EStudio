"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSimpleContentRenders } from "@/hooks/use-content";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import { getProviderDefinition } from "@/lib/publishing/providers";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";
import { invalidateAuthQueries } from "@/lib/auth/client-sync";

export type RenderItem = {
  name: string;
  assetUrl: string;
  size: number;
  mtimeMs: number;
  thumbnailUrl?: string | null;
};

export type ProviderState = {
  id: string;
  label: string;
  status?: string;
  connected: boolean;
  connectionId?: string | null;
  channel?: { title: string | null; thumbnail: string | null } | null;
  capabilities?: {
    supportsSchedule?: boolean;
    supportsPrivacy?: boolean;
    privacyOptions?: Array<"public" | "unlisted" | "private">;
    supportsTags?: boolean;
    supportsCategories?: boolean;
    supportsSyntheticMediaDisclosure?: boolean;
  };
};

type PublishProvidersPayload = Awaited<ReturnType<typeof sdk.publish.providers>>;
type PublishProviderPayload = Awaited<ReturnType<typeof sdk.publish.provider>>;

export const usePublishTargets = (params: {
  contentId: string;
  open: boolean;
}) => {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const { contentId, open } = params;
  const enabled = open && status === "authenticated" && Boolean(contentId);

  useEffect(() => {
    if (!enabled) return;
    void invalidateAuthQueries(queryClient);
  }, [enabled, queryClient]);

  const publishTargetsQuery = useQuery<ProviderState[]>({
    queryKey: queryKeys.publishProviders,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const payload = (await sdk.publish.providers()) as PublishProvidersPayload;
      const publishTargets = payload.publishTargets ?? [];
      return publishTargets.map((target: PublishProvidersPayload["publishTargets"][number]) => ({
        ...target,
        connected: Boolean(target.connected),
        channel:
          (target as { channel?: ProviderState["channel"] }).channel ?? null,
        connectionId: target.connectionId ?? null,
      }));
    },
  });

  const providerDetailQueries = useQueries({
    queries: (publishTargetsQuery.data ?? []).map((target) => {
      const definition = getProviderDefinition(target.id);
      const endpoint = definition?.connectionEndpoint;
      return {
        queryKey: queryKeys.publishProvider(target.id),
        enabled: enabled && Boolean(endpoint),
        staleTime: 60_000,
        queryFn: async () => {
          if (!endpoint) return null;
          return sdk.publish.provider(target.id);
        },
      };
    }),
  });

  const targets = useMemo(() => {
    const base = publishTargetsQuery.data ?? [];
    if (providerDetailQueries.length === 0) return base;
    return base.map((target, index) => {
      const detail = providerDetailQueries[index]?.data as
        | PublishProviderPayload
        | null
        | undefined;
      if (!detail) return target;
      return {
        ...target,
        connected: detail.connected,
        channel: detail.channel ?? null,
        status: detail.connected ? "active" : target.status,
      };
    });
  }, [publishTargetsQuery.data, providerDetailQueries]);

  const connectedTargets = useMemo(
    () => targets.filter((target) => target.connected),
    [targets]
  );

  const contentSummaryQuery = useQuery<{
    title?: string;
    thumbnailUrl: string;
    colorPalette?: string[] | null;
  }>({
    queryKey: queryKeys.contentSummary(contentId),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const payload = await sdk.content.get(contentId);
      return {
        title: payload.title,
        thumbnailUrl: sdk.content.assetUrl(contentId, "thumbnail"),
        colorPalette: payload.colorPalette ?? null,
      };
    },
  });

  const rendersQuery = useSimpleContentRenders({
    id: contentId,
    enabled,
    limit: 50,
  });

  return {
    enabled,
    publishTargetsQuery,
    connectedTargets,
    contentSummaryQuery,
    rendersQuery,
  };
};

export const useCreatePublishMutation = (contentId: string) =>
  useMutation({
    mutationFn: async (payload: {
      provider: string;
      renderId: string;
      connectionId: string;
      metadata: Record<string, unknown>;
    }) => {
      const result = await sdk.content.createPublish(contentId, {
        ...payload,
        status: "draft",
      });
      return result.publish?.id ?? null;
    },
  });

export const usePublishProgressTracker = (publishId: string | null) => {
  const { socket } = useSocketIO();
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [publishStage, setPublishStage] = useState<string | null>(null);
  const [publishProgress, setPublishProgress] = useState<number | null>(null);
  const [publishBytes, setPublishBytes] = useState<{
    uploaded?: number;
    total?: number;
  } | null>(null);

  useEffect(() => {
    if (!socket || !publishId) return;

    const handleProgress = (payload: {
      id: string;
      stage?: string;
      progress?: number;
      bytesUploaded?: number;
      bytesTotal?: number;
    }) => {
      if (payload.id !== publishId) return;
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
    }) => {
      if (payload.id !== publishId) return;
      if (payload.status) {
        setPublishStatus(payload.status);
      }
    };

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.publish.progress, handler: handleProgress },
      { event: SocketEvents.publish.update, handler: handleUpdate },
    ] as const);
  }, [socket, publishId]);

  return {
    publishStatus: publishId ? publishStatus : null,
    setPublishStatus,
    publishStage: publishId ? publishStage : null,
    publishProgress: publishId ? publishProgress : null,
    publishBytes: publishId ? publishBytes : null,
  };
};
