"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Link2, UserRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authProviderIcons } from "@/components/auth/auth-page";
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
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { ConnectionsResponse, ProfilePayload } from "@/types";

const allProviders = [
  {
    id: "google" as const,
    label: "Google",
  },
  {
    id: "github" as const,
    label: "GitHub",
  },
  {
    id: "discord" as const,
    label: "Discord",
  },
];

const emptyProfile: ProfilePayload = {
  name: "",
  email: "",
  image: null,
  pendingEmail: null,
};

export default function ProfileSettingsPage() {
  const { data: session, status, update } = useSession();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfilePayload>(emptyProfile);
  const [draft, setDraft] = useState<ProfilePayload>(emptyProfile);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<
    Record<string, { image?: string | null; name?: string | null }>
  >({});
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const [pendingProvider, setPendingProvider] = useState<
    (typeof allProviders)[number] | null
  >(null);
  const [pendingUnlink, setPendingUnlink] = useState<
    (typeof allProviders)[number] | null
  >(null);

  const initials = useMemo(() => {
    const parts = (draft.name || session?.user?.name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [draft.name, session?.user?.name]);

  const compareEmail = profile.pendingEmail ?? profile.email;
  const isDirty = draft.name !== profile.name || draft.email !== compareEmail;
  const avatarProvider = useMemo(() => {
    if (providerProfiles.google?.image) return "google";
    if (providerProfiles.github?.image) return "github";
    if (providerProfiles.discord?.image) return "discord";
    return null;
  }, [providerProfiles]);
  const avatarCacheBust = useMemo(
    () => (connectedProviders.length ? Date.now() : Date.now()),
    [connectedProviders.length]
  );
  const avatarSrc = avatarProvider
    ? sdk.user.avatarUrl(avatarProvider, String(avatarCacheBust))
    : draft.image ?? undefined;
  const connectedSet = useMemo(
    () => new Set(connectedProviders),
    [connectedProviders]
  );
  const providers = useMemo(
    () => allProviders.filter((provider) => enabledProviders.includes(provider.id)),
    [enabledProviders]
  );

  const profileQuery = useQuery<ProfilePayload>({
    queryKey: queryKeys.profile,
    enabled: status === "authenticated",
    staleTime: 60_000,
    queryFn: async () => sdk.user.profile(),
  });

  const connectionsQuery = useQuery<ConnectionsResponse>({
    queryKey: queryKeys.profileConnections,
    enabled: status === "authenticated",
    staleTime: 60_000,
    queryFn: async () => sdk.user.connections(),
  });

  const metaProvidersQuery = useQuery<{ oauthProviders?: string[] }>({
    queryKey: queryKeys.metaProviders,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => sdk.meta.providers(),
  });

  const loading = profileQuery.isLoading || profileQuery.isFetching;
  const connectionsLoading =
    connectionsQuery.isLoading || connectionsQuery.isFetching;

  useEffect(() => {
    if (!profileQuery.data) return;
    const payload = profileQuery.data;
    const nextDraft = {
      ...payload,
      email: payload.pendingEmail ?? payload.email,
    };
    setProfile(payload);
    setDraft(nextDraft);
  }, [profileQuery.data]);

  useEffect(() => {
    if (!profileQuery.error) return;
    const message =
      profileQuery.error instanceof Error
        ? profileQuery.error.message
        : "Unable to load profile.";
    toast.error(message);
  }, [profileQuery.error]);

  useEffect(() => {
    if (!connectionsQuery.data) return;
    const connections = connectionsQuery.data.connections ?? [];
    setConnectedProviders(connections.map((connection) => connection.provider));
    setProviderProfiles(
      Object.fromEntries(
        connections.map((connection) => [
          connection.provider,
          connection.profile ?? { name: null, image: null },
        ])
      )
    );
  }, [connectionsQuery.data]);

  useEffect(() => {
    if (!connectionsQuery.error) return;
    const message =
      connectionsQuery.error instanceof Error
        ? connectionsQuery.error.message
        : "Unable to load connected accounts.";
    toast.error(message);
  }, [connectionsQuery.error]);

  useEffect(() => {
    if (metaProvidersQuery.data) {
      setEnabledProviders(metaProvidersQuery.data.oauthProviders ?? []);
      return;
    }
    if (metaProvidersQuery.isError) {
      setEnabledProviders(allProviders.map((provider) => provider.id));
    }
  }, [metaProvidersQuery.data, metaProvidersQuery.isError]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return (await sdk.user.updateProfile({
        name: draft.name,
        email: draft.email,
      })) as ProfilePayload;
    },
    onSuccess: async (payload) => {
      const nextDraft = {
        ...payload,
        email: payload.pendingEmail ?? payload.email,
      };
      setProfile(payload);
      setDraft(nextDraft);
      queryClient.setQueryData(queryKeys.profile, payload);
      if (update) {
        await update({
          name: payload.name,
          email: payload.email,
          image: payload.image ?? undefined,
        });
      }
      if (payload.pendingEmail) {
        sessionStorage.removeItem("profile-email-confirmed");
        toast.success("Check your inbox to confirm the new email.");
      } else {
        toast.success("Profile updated.");
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to update profile."
      );
    },
  });

  const handleSave = async () => {
    await saveMutation.mutateAsync();
  };

  const saving = saveMutation.isPending;

  useEffect(() => {
    const fallbackProfile: ProfilePayload = {
      name: session?.user?.name ?? "",
      email: session?.user?.email ?? "",
      image: session?.user?.image ?? null,
    };
    setDraft((prev) => ({
      ...prev,
      ...fallbackProfile,
    }));
    setProfile((prev) => ({
      ...prev,
      ...fallbackProfile,
    }));
  }, [session?.user?.email, session?.user?.image, session?.user?.name]);

  useEffect(() => {
    const confirmed = searchParams?.get("email") === "confirmed";
    const cookieConfirmed =
      typeof document !== "undefined" &&
      document.cookie.includes("email-change-confirmed=true");

    if (confirmed || cookieConfirmed) {
      if (sessionStorage.getItem("profile-email-confirmed") !== "true") {
        toast.success("Email confirmed. Your profile is updated.");
        sessionStorage.setItem("profile-email-confirmed", "true");
      }
      if (update) {
        void update();
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("email");
      window.history.replaceState({}, "", url);
      document.cookie =
        "email-change-confirmed=; Path=/; Max-Age=0; SameSite=Lax";
    }
  }, [searchParams, update]);

  return (
    <div className="flex flex-col w-full max-w-screen-md mx-auto justify-center items-center gap-6">
      <Card className="pt-0 pb-6 relative w-full overflow-hidden border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <div
          className="relative h-32 bg-muted bg-cover bg-center sm:h-40"
          style={{
            backgroundImage:
              "url(/profile-card-cover.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/20" />
          {/* <div className="absolute bottom-3 right-3 flex gap-2">
            <Button variant="secondary" size="sm" type="button">
              Change Cover
            </Button>
          </div> */}
        </div>
        <div className="px-6 pb-6 -mt-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white shadow-lg sm:h-28 sm:w-28 dark:border-slate-900">
                <AvatarImage src={avatarSrc} alt={draft.name} />
                <AvatarFallback className="bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -bottom-1 -right-1 size-8 rounded-full shadow-md"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 text-center sm:pb-1 sm:text-left">
              <h3 className="text-lg font-semibold">
                {draft.name || "Your name"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {draft.email || "you@studio.com"}
              </p>
            </div>
          </div>
        </div>
      </Card>

        <Card className="flex border-slate-200 w-full bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex shrink-0 h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
              <UserRound className="h-5 w-5 flex shrink-0" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
                Profile details
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Keep your identity sharp for collaborators and notifications.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={draft.name}
                placeholder="Add your name"
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                disabled={loading || status !== "authenticated"}
                className="h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-email">Email address</Label>
              <Input
                id="profile-email"
                type="email"
                value={draft.email}
                placeholder="you@studio.com"
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, email: event.target.value }))
                }
                disabled={loading || status !== "authenticated"}
                className="h-11"
              />
              {profile.pendingEmail ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Pending verification for {profile.pendingEmail}. Check your
                  inbox to confirm.
                </p>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                We will use this email for sign-in alerts and account recovery.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handleSave}
                loading={saving}
                loadingText="Saving..."
                disabled={
                  loading ||
                  status !== "authenticated" ||
                  saving ||
                  !isDirty
                }
                className="h-11"
              >
                Save changes
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading || status !== "authenticated" || !isDirty}
                onClick={() =>
                  setDraft({
                    ...profile,
                    email: profile.pendingEmail ?? profile.email,
                  })
                }
                className="h-11 border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
              >
                Reset
              </Button>
            </div>

            {status === "unauthenticated" && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Sign in to update your profile.
              </p>
            )}
          </div>
        </Card>


      <Card className="flex border-slate-200 w-full bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex shrink-0 h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Link2 className="h-5 w-5 flex shrink-0" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Social accounts
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Link sign-in providers to your profile.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {providers.map((provider) => {
            const isConnected = connectedSet.has(provider.id);
            return (
              <div
                key={provider.id}
                className="rounded-2xl border border-slate-200 p-4 shadow-sm transition-all dark:border-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">
                      {providerProfiles[provider.id]?.image ? (
                        <ImageWithSkeleton
                          src={sdk.user.avatarUrl(provider.id, String(avatarCacheBust))}
                          alt={`${provider.label} account`}
                          className="h-full w-full object-cover"
                          wrapperClassName="h-full w-full"
                        />
                      ) : (
                        authProviderIcons[provider.id]
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-900 dark:text-zinc-50">
                          {providerProfiles[provider.id]?.name ?? provider.label}
                        </p>
                        {isConnected ? (
                          <Badge variant="outline" className="gap-1">
                            {authProviderIcons[provider.id]}
                            {provider.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        {isConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:bg-white/10 dark:text-zinc-300">
                      Idle
                    </span>
                  )}
                </div>
                <div className="mt-2 flex w-full flex-col gap-2 lg:flex-row lg:gap-x-2">
                  <Button
                    type="button"
                    className="w-full lg:flex-1"
                    variant={isConnected ? "outline" : "default"}
                    disabled={
                      connectionsLoading ||
                      status !== "authenticated" ||
                      isConnected
                    }
                    onClick={() => setPendingProvider(provider)}
                  >
                    {isConnected ? "Connected" : `Connect ${provider.label}`}
                  </Button>
                  {isConnected ? (
                    <Button
                      type="button"
                      className="w-full lg:flex-1"
                      variant="destructive"
                      disabled={connectionsLoading || status !== "authenticated"}
                      onClick={() => setPendingUnlink(provider)}
                    >
                      Unlink
                    </Button>
                  ) : null}
                </div>

              </div>
            );
          })}
        </div>

        {status === "unauthenticated" && (
          <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
            Sign in to link your accounts.
          </p>
        )}
      </Card>

      <AlertDialog
        open={Boolean(pendingProvider)}
        onOpenChange={(open) => {
          if (!open) setPendingProvider(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link {pendingProvider?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              You are signed in, so we can safely link this provider to your
              current account even if the provider email differs. You can then
              sign in with either method.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingProvider) return;
                signIn(pendingProvider.id, {
                  callbackUrl: "/settings/profile",
                });
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingUnlink)}
        onOpenChange={(open) => {
          if (!open) setPendingUnlink(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink {pendingUnlink?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the provider from your account. You will no longer be
              able to sign in with it unless you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!pendingUnlink) return;
                try {
                  await sdk.user.unlinkProvider(pendingUnlink.id);
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.profileConnections,
                  });
                  toast.success("Provider unlinked.");
                  window.dispatchEvent(new Event("profile:connections-updated"));
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to unlink provider."
                  );
                } finally {
                  setPendingUnlink(null);
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
