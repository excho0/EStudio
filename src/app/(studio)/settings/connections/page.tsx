"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { PROVIDER_REGISTRY } from "@/lib/publishing/providers";
import { queryKeys } from "@/lib/query-keys";
import { fetchJson } from "@/lib/fetch-json";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ProviderConnectionState, ProviderDefinition } from "@/types";

const buildProviderState = (providers: ProviderDefinition[]) =>
  Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      {
        connected: false,
        needsReconnect: false,
        channel: null,
        loading: true,
        enabled: false,
      } satisfies ProviderConnectionState,
    ])
  ) as Record<string, ProviderConnectionState>;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export default function ConnectionsSettingsPage() {
  const { status } = useSession();
  const providers = useMemo(
    () => Object.values(PROVIDER_REGISTRY),
    []
  );
  const allProviders = useMemo(
    () => providers.map((provider) => provider.oauthProviderName ?? provider.id),
    [providers]
  );
  const providerExamples = useMemo(() => {
    const labels = providers.map((provider) => provider.label);
    if (labels.length === 0) return "publishing services";
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  }, [providers]);
  const [unlinkTarget, setUnlinkTarget] = useState<ProviderDefinition | null>(null);
  const queryClient = useQueryClient();

  const metaProvidersQuery = useQuery<{ oauthProviders?: string[] }>({
    queryKey: queryKeys.metaProviders,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      return fetchJson<{ oauthProviders?: string[] }>(
        "/api/meta/providers",
        undefined,
        "Failed to load providers."
      );
    },
  });

  const enabledProviders = metaProvidersQuery.data?.oauthProviders ?? allProviders;

  const connectionQueries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: queryKeys.publishProvider(provider.id),
      enabled: status === "authenticated",
      staleTime: 60_000,
      queryFn: async () => {
        return fetchJson<{
          connected: boolean;
          needsReconnect?: boolean;
          channel?: { title: string | null; thumbnail: string | null };
        }>(
          `/api/publish/providers/${provider.id}`,
          undefined,
          `Unable to load ${provider.label} connection.`
        );
      },
    })),
  });

  const connections = useMemo(() => {
    const next = buildProviderState(providers);
    providers.forEach((provider, index) => {
      const query = connectionQueries[index];
      const data = query?.data;
      const providerKey = provider.oauthProviderName ?? provider.id;
      next[provider.id] = {
        ...next[provider.id],
        connected: Boolean(data?.connected),
        needsReconnect: Boolean(data?.needsReconnect),
        channel: data?.channel ?? null,
        enabled: enabledProviders.includes(providerKey),
        loading: query?.isLoading || query?.isFetching,
      };
    });
    return next;
  }, [providers, connectionQueries, enabledProviders]);

  const thumbnailCacheBust = useMemo(() => {
    const bust: Record<string, number> = {};
    for (const provider of providers) {
      const thumbnail = connections[provider.id]?.channel?.thumbnail;
      bust[provider.id] = thumbnail ? hashString(thumbnail) : 0;
    }
    return bust;
  }, [connections, providers]);

  useEffect(() => {
    connectionQueries.forEach((query, index) => {
      if (!query?.error) return;
      const provider = providers[index];
      const message =
        query.error instanceof Error
          ? query.error.message
          : `Unable to load ${provider.label} connection.`;
      toast.error(message);
    });
  }, [connectionQueries, providers]);

  const unlinkMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await fetch(`/api/publish/providers/${providerId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload?.error ?? `Unable to unlink ${providerId}.`);
      }
    },
    onSuccess: async (_data, providerId) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.publishProvider(providerId),
      });
      toast.success(`${providerId} disconnected.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to unlink provider."
      );
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex shrink-0 h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Publish destinations
            </h2>
            <p className="text-sm text-muted-foreground">
              Link publishing services like {providerExamples} when you are ready.
            </p>
          </div>
        </div>
        
        <div className="mt-6 grid gap-4">
          {providers.map((provider) => {
            const state = connections[provider.id];
            const providerId = provider.id;
            const providerLabel = provider.label;
            const connected = state?.connected ?? false;
            const needsReconnect = state?.needsReconnect ?? false;
            const channel = state?.channel ?? null;
            const enabled = state?.enabled ?? false;
            const isLoading = state?.loading ?? false;
            const oauthProviderId = provider.oauthProviderId ?? providerId;
            const cacheBust = thumbnailCacheBust[providerId] ?? 0;
            const canConnect = Boolean(provider.oauthProviderId);

            return (
              <div
                key={provider.id}
                className="rounded-2xl border border-slate-200 p-5 shadow-sm dark:border-white/10"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">
                      {channel?.thumbnail ? (
                        <ImageWithSkeleton
                          src={`${channel.thumbnail}${channel.thumbnail.includes("?") ? "&" : "?"}v=${cacheBust}`}
                          alt={channel.title ?? `${providerLabel} channel`}
                          className="h-full w-full object-cover"
                          wrapperClassName="h-full w-full"
                        />
                      ) : provider.icon ? (
                        <provider.icon className="h-5 w-5" />
                      ) : null}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-900 dark:text-zinc-50">
                          {channel?.title ?? providerLabel}
                        </p>
                        {channel ? (
                          <Badge variant={provider.badgeVariant ?? "outline"}>
                            {provider.icon ? (
                              <provider.icon className="h-3.5 w-3.5" />
                            ) : null}
                            {providerLabel}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        {channel?.title
                          ? "Connected channel"
                          : `Upload renders directly to your ${providerLabel} channel.`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] ${
                      connected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                        : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-zinc-300"
                    }`}
                  >
                    {connected ? "Active" : "Idle"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    disabled={
                      isLoading ||
                      status !== "authenticated" ||
                      !enabled ||
                      !canConnect ||
                      (connected && !needsReconnect)
                    }
                    variant={connected ? "outline" : "default"}
                    onClick={() =>
                      signIn(oauthProviderId, {
                        callbackUrl: "/settings/connections",
                      })
                    }
                  >
                    {needsReconnect
                      ? `Reconnect ${providerLabel}`
                      : connected
                        ? "Connected"
                        : `Connect ${providerLabel}`}
                  </Button>
                  {connected ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isLoading || status !== "authenticated"}
                      onClick={() => setUnlinkTarget(provider)}
                    >
                      Unlink
                    </Button>
                  ) : null}
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {!canConnect
                      ? `Connection not configured for ${providerLabel}.`
                      : !enabled
                        ? `Enable ${providerLabel} OAuth to connect.`
                        : needsReconnect
                          ? "Connection needs to be re-established."
                          : `Requires consent for ${providerLabel} upload scopes.`}
                  </p>
                </div>

                {status === "unauthenticated" && (
                  <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
                    Sign in to manage publishing connections.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <AlertDialog
        open={Boolean(unlinkTarget)}
        onOpenChange={(open) => setUnlinkTarget(open ? unlinkTarget : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink {unlinkTarget?.label ?? "provider"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This disconnects your {unlinkTarget?.label ?? "provider"} channel
              and removes the stored tokens. You can reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!unlinkTarget) return;
                try {
                  await unlinkMutation.mutateAsync(unlinkTarget.id);
                } finally {
                  setUnlinkTarget(null);
                }
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
