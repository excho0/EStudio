"use client";

import { Link } from "@/components/navigation/route-transition";
import { LogOut, UserRoundPen } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

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

const resolveAvatarSrc = async (fallback?: string | null) => {
  try {
    const response = await fetch("/api/user/profile/connections");
    if (!response.ok) return fallback ?? undefined;
    const payload = (await response.json()) as {
      profiles?: Record<string, { image?: string | null }>;
    };
    const profiles = payload.profiles ?? {};
    const provider =
      providerOrder.find((id) => profiles[id]?.image) ?? null;
    if (provider) {
      return `/api/user/profile/avatar?provider=${provider}&v=${Date.now()}`;
    }
    return fallback ?? undefined;
  } catch {
    return fallback ?? undefined;
  }
};

export function UserNav() {
  const { data, status } = useSession();
  const user = data?.user;
  const [open, setOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);
  const initials = getInitials(user?.name, user?.email);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    const run = async () => {
      const nextSrc = await resolveAvatarSrc(user?.image);
      if (active) setAvatarSrc(nextSrc);
    };
    void run();
    return () => {
      active = false;
    };
  }, [status, user?.image]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    const handler = () => {
      void (async () => {
        const nextSrc = await resolveAvatarSrc(user?.image);
        if (active) setAvatarSrc(nextSrc);
      })();
    };
    window.addEventListener("profile:connections-updated", handler);
    return () => {
      active = false;
      window.removeEventListener("profile:connections-updated", handler);
    };
  }, [status, user?.image]);

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
