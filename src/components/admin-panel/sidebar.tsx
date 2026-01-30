"use client";
import { Menu } from "@/components/admin-panel/menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardSocket } from "@/app/(studio)/_components/dashboard-socket";
import { useSidebar } from "@/hooks/use-sidebar";
import { useStore } from "@/hooks/use-store";
import { cn } from "@/lib/utils";
import { Link } from "@/components/route-transition";
import { ImageWithSkeleton } from "@/components/ui/image-with-skeleton";

export function Sidebar() {
  const sidebar = useStore(useSidebar, (x) => x);
  const { connected, socket } = useDashboardSocket();
  const isConnected = connected || socket?.connected === true;
  if (!sidebar) return null;
  const { getOpenState, setIsHover, settings } = sidebar;
  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-30 h-screen -translate-x-full lg:translate-x-0 transition-[width] ease-in-out duration-300",
        !getOpenState() ? "w-[90px]" : "w-72",
        settings.disabled && "hidden"
      )}
    >
      {/* <SidebarToggle isOpen={isOpen} setIsOpen={toggleOpen} /> */}
      <div
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        className="relative h-full flex flex-col px-3 py-4 overflow-y-auto shadow-md dark:shadow-zinc-800 bg-sidebar"
      >
        <Button
          variant="ghost"
          asChild
        >
          <Link href="/dashboard" className="flex items-center gap-2">
            <ImageWithSkeleton
              src="/favicon.png"
              alt="logo"
              width={52}
              height={52}
              wrapperClassName="rounded-full"
              className="rounded-full"
            />
            <h1
              className={cn(
                "font-bold text-lg whitespace-nowrap transition-[transform,opacity,display] ease-in-out duration-300",
                !getOpenState()
                  ? "-translate-x-96 opacity-0 hidden"
                  : "translate-x-0 opacity-100"
              )}
            >
              EStudio
            </h1>
          </Link>
        </Button>

        <Menu isOpen={getOpenState()} />

        <div className="px-2 py-4">
          {getOpenState() ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <span
                className={`relative flex h-3 w-3 items-center justify-center rounded-full border ${
                  isConnected ? "border-emerald-300/60" : "border-amber-300/60"
                }`}
              >
                <span
                  className={`absolute inset-0 rounded-full ${
                    isConnected
                      ? "animate-pulse bg-emerald-400/25"
                      : "animate-pulse bg-amber-400/25"
                  }`}
                  style={{ animationDuration: "2.6s" }}
                />
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
              </span>
              {isConnected ? "Connected" : "Connecting"}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center">
                  <span
                    className={`relative flex h-3 w-3 items-center justify-center rounded-full border ${
                      isConnected ? "border-emerald-300/60" : "border-amber-300/60"
                    }`}
                  >
                    <span
                      className={`absolute inset-0 rounded-full ${
                        isConnected
                          ? "animate-pulse bg-emerald-400/25"
                          : "animate-pulse bg-amber-400/25"
                      }`}
                      style={{ animationDuration: "2.6s" }}
                    />
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isConnected ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isConnected ? "Connected" : "Connecting"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </aside>
  );
}
