"use client";

import { Link } from "@/components/navigation/route-transition";
import { LogOut, UserRoundPen } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sdk } from "@/lib/sdk";
import { syncProfileQueries } from "@/lib/http/query-sync";
import { useProfileConnections } from "@/hooks/use-profile";
import {
  ResponsiveActionMenu,
  type ActionItem,
} from "@/components/controls/responsive-action-menu";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

const getInitials = (name?: string | null, email?: string | null) => {
  const base = name?.trim() || email?.split("@")[0]?.trim() || "User";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
};

const providerOrder = ["google", "github", "discord"] as const;

export function UserNav() {
  const { data, status } = useSession();
  const user = data?.user;
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const initials = getInitials(user?.name, user?.email);
  const [loadedAvatarSrc, setLoadedAvatarSrc] = useState<string | null>(null);

  const connectionsQuery = useProfileConnections({
    enabled: status === "authenticated",
  });

  const avatarProvider = useMemo(() => {
    const connections = connectionsQuery.data?.connections ?? [];
    return (
      providerOrder.find((id) =>
        connections.find((connection) => connection.provider === id)?.profile?.image
      ) ?? null
    );
  }, [connectionsQuery.data]);

  const avatarSrc = useMemo(() => {
    if (avatarProvider) {
      const bust = connectionsQuery.dataUpdatedAt || 0;
      return sdk.user.avatarUrl(avatarProvider, String(bust));
    }
    return user?.image ?? undefined;
  }, [avatarProvider, connectionsQuery.dataUpdatedAt, user?.image]);
  const avatarLoaded = Boolean(avatarSrc) && loadedAvatarSrc === avatarSrc;

  const menuItems = useMemo<ActionItem[]>(
    () => [
      {
        label: "Edit Profile",
        icon: UserRoundPen,
        href: "/settings/profile",
      },
      { type: "separator" },
      {
        label: "Sign out",
        icon: LogOut,
        destructive: true,
        onSelect: () => {
          signOut({ callbackUrl: "/login" });
        },
      },
    ],
    []
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    const handler = () => {
      void syncProfileQueries(queryClient);
    };
    window.addEventListener("profile:connections-updated", handler);
    return () => {
      window.removeEventListener("profile:connections-updated", handler);
    };
  }, [queryClient, status]);

  return (
    <AnimatePresence mode="wait">
      {status === "loading" ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeInOut" }}
        >
          <Skeleton className="h-9 w-9 rounded-full animate-pulse" />
        </motion.div>
      ) : !user ? (
        <motion.div
          key="signed-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeInOut" }}
        >
          <Button asChild variant="outline" className="h-9 rounded-4xl">
            <Link href="/login">Sign in</Link>
          </Button>
        </motion.div>
      ) : (
        <motion.div
          key="signed-in"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeInOut" }}
          className="flex items-center justify-center"
        >
          <ResponsiveActionMenu
            open={open}
            onOpenChange={setOpen}
            title="Account"
            items={menuItems}
            trigger={
              <Button
                variant="outline"
                className="relative h-9 w-9 rounded-full border-white/10 bg-linear-to-br from-white/10 via-transparent to-white/5 shadow-sm"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={avatarSrc}
                    alt={user.name ?? "Avatar"}
                    onLoad={() => setLoadedAvatarSrc(avatarSrc ?? null)}
                    className={avatarLoaded ? "opacity-100 transition-opacity duration-300" : "opacity-0 transition-opacity duration-300"}
                  />
                  <AvatarFallback className="bg-transparent text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            }
            contentHeader={
              <div className="px-3 py-2 lg:px-2 lg:py-1">
                <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:items-center lg:justify-center lg:gap-3 lg:text-left">
                  <Avatar className="h-16 w-16 border-3 border-white shadow-lg lg:h-14 lg:w-14 dark:border-slate-900">
                    <AvatarImage src={avatarSrc} alt={user.name ?? "Avatar"} />
                    <AvatarFallback className="bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1.5 lg:space-y-1">
                    <p className="truncate text-base font-semibold leading-none lg:text-sm">
                      {user.name ?? "Signed in"}
                    </p>
                    {user.email ? (
                      <p className="truncate text-sm leading-none text-muted-foreground lg:text-xs">
                        {user.email}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
