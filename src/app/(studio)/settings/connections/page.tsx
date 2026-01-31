"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Link2, ShieldCheck, Sparkles, Youtube } from "lucide-react";
import { toast } from "sonner";

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

export default function ConnectionsSettingsPage() {
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState<{
    title: string | null;
    thumbnail: string | null;
  } | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const thumbnailCacheBust = useMemo(
    () => Date.now(),
    [youtubeChannel?.thumbnail]
  );

  const loadConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/connections/youtube");
      if (!response.ok) {
        throw new Error("Unable to load YouTube connection.");
      }
      const payload = (await response.json()) as {
        connected: boolean;
        needsReconnect?: boolean;
        channel?: { title: string | null; thumbnail: string | null };
      };
      setYoutubeConnected(Boolean(payload.connected));
      setYoutubeChannel(payload.channel ?? null);
      setNeedsReconnect(Boolean(payload.needsReconnect));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load YouTube connection."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadProviderConfig = async () => {
    try {
      const response = await fetch("/api/meta/providers");
      if (!response.ok) return;
      const payload = (await response.json()) as { oauthProviders?: string[] };
      const oauthProviders = payload.oauthProviders ?? [];
      setYoutubeEnabled(oauthProviders.includes("google"));
    } catch {
      setYoutubeEnabled(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      void loadConnections();
      void loadProviderConfig();
    } else {
      setLoading(false);
    }
  }, [status]);

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
              Link publishing services like YouTube when you are ready.
            </p>
          </div>
        </div>
        
        <div className="rounded-2xl border border-slate-200 p-5 mt-6 shadow-sm dark:border-white/10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">
                {youtubeChannel?.thumbnail ? (
                  <ImageWithSkeleton
                    src={`${youtubeChannel.thumbnail}${youtubeChannel.thumbnail.includes("?") ? "&" : "?"}v=${thumbnailCacheBust}`}
                    alt={youtubeChannel.title ?? "YouTube channel"}
                    className="h-full w-full object-cover"
                    wrapperClassName="h-full w-full"
                  />
                ) : (
                  <Youtube className="h-5 w-5" />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-slate-900 dark:text-zinc-50">
                    {youtubeChannel?.title ?? "YouTube"}
                  </p>
                  {youtubeChannel ? (
                    <Badge variant={"red"}>
                      <Youtube className="h-3.5 w-3.5" />
                      YouTube
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {youtubeChannel?.title
                    ? "Connected channel"
                    : "Upload renders directly to your channel."}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] ${
                youtubeConnected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-zinc-300"
              }`}
            >
              {youtubeConnected ? "Active" : "Idle"}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={
                loading ||
                status !== "authenticated" ||
                !youtubeEnabled ||
                (youtubeConnected && !needsReconnect)
              }
              variant={youtubeConnected ? "outline" : "default"}
              onClick={() =>
                signIn("google-youtube", {
                  callbackUrl: "/settings/connections",
                })
              }
            >
              {needsReconnect
                ? "Reconnect YouTube"
                : youtubeConnected
                  ? "Connected"
                  : "Connect YouTube"}
            </Button>
            {youtubeConnected ? (
              <Button
                type="button"
                variant="destructive"
                disabled={loading || status !== "authenticated"}
                onClick={() => setUnlinkOpen(true)}
              >
                Unlink
              </Button>
            ) : null}
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {!youtubeEnabled
                ? "Enable Google OAuth to connect YouTube."
                : needsReconnect
                  ? "Connection needs to be re-established."
                  : "Requires Google consent for YouTube upload scopes."}
            </p>
          </div>

          {status === "unauthenticated" && (
            <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
              Sign in to manage publishing connections.
            </p>
          )}
        </div>
      </Card>

      <AlertDialog
        open={unlinkOpen}
        onOpenChange={(open) => setUnlinkOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink YouTube?</AlertDialogTitle>
            <AlertDialogDescription>
              This disconnects your YouTube channel and removes the stored
              tokens. You can reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  const response = await fetch("/api/connections/youtube", {
                    method: "DELETE",
                  });
                  if (!response.ok) {
                    const payload = (await response.json()) as {
                      error?: string;
                    };
                    throw new Error(
                      payload?.error ?? "Unable to unlink YouTube."
                    );
                  }
                  await loadConnections();
                  toast.success("YouTube disconnected.");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to unlink YouTube."
                  );
                } finally {
                  setUnlinkOpen(false);
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
