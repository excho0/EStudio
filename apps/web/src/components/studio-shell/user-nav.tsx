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

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

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
          transition={{ duration: 1, ease: "easeInOut" }}
        >
          <Skeleton className="h-9 w-9 rounded-full animate-pulse" />
        </motion.div>
      ) : !user ? (
        <motion.div
          key="signed-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
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
          transition={{ duration: 1, ease: "easeInOut" }}
          className="flex items-center justify-center"
        >
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <TooltipProvider disableHoverableContent>
              <Tooltip delayDuration={100} disableMobileDrawer >
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="relative h-9 w-9 rounded-full border-white/10 bg-gradient-to-br from-white/10 via-transparent to-white/5 shadow-sm"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={avatarSrc} alt={user.name ?? "Avatar"} />
                        <AvatarFallback className="bg-transparent text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Profile</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user.name ?? "Signed in"}
                  </p>
                  {user.email ? (
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  ) : null}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="hover:cursor-pointer"
                  asChild
                >
                  <Link
                    href="/settings/profile"
                    className="flex items-center"
                    onClick={() => setOpen(false)}
                  >
                    <UserRoundPen className="w-4 h-4 mr-3 text-muted-foreground" />
                    Edit Profile
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="hover:cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
              >
                <LogOut className="w-4 h-4 mr-3 text-muted-foreground" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
