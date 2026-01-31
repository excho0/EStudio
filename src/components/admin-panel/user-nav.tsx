"use client";

import { Link } from "@/components/route-transition";
import { LogOut, UserRoundPen } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export function UserNav() {
  const { data } = useSession();
  const { status } = useSession();
  const user = data?.user;
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);
  const initials = getInitials(user?.name, user?.email);

  const providerOrder = useMemo(() => ["google", "github", "discord"], []);

  const refreshAvatar = useCallback(async () => {
    if (status !== "authenticated") {
      setAvatarSrc(undefined);
      return;
    }
    try {
      const response = await fetch("/api/user/profile/connections");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        profiles?: Record<string, { image?: string | null }>;
      };
      const profiles = payload.profiles ?? {};
      const provider =
        providerOrder.find((id) => profiles[id]?.image) ?? null;
        if (provider) {
          setAvatarSrc(`/api/user/profile/avatar?provider=${provider}&v=${Date.now()}`);
        } else {
          setAvatarSrc(user?.image ?? undefined);
        }
    } catch {
      setAvatarSrc(user?.image ?? undefined);
    }
  }, [providerOrder, status, user?.image]);

  useEffect(() => {
    if (status !== "authenticated") {
      setAvatarSrc(undefined);
      return;
    }
    void refreshAvatar();
  }, [refreshAvatar, status]);

  useEffect(() => {
    const handler = () => {
      void refreshAvatar();
    };
    window.addEventListener("profile:connections-updated", handler);
    return () => window.removeEventListener("profile:connections-updated", handler);
  }, [refreshAvatar]);

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
        >
          <DropdownMenu>
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
                <DropdownMenuItem className="hover:cursor-pointer" asChild>
                  <Link href="/settings/profile" className="flex items-center">
                    <UserRoundPen className="w-4 h-4 mr-3 text-muted-foreground" />
                    Edit Profile
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="hover:cursor-pointer"
                onClick={() => signOut({ callbackUrl: "/login" })}
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
