"use client";

import { Sidebar } from "@/components/admin-panel/sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { useStore } from "@/hooks/use-store";
import { cn } from "@/lib/utils";
import { ModeToggle } from "../mode-toggle";
import { SheetMenu } from "@/components/admin-panel/sheet-menu";
import { SidebarToggle } from "./sidebar-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  RouteTransitionProvider,
  useRouteTransition,
} from "@/components/route-transition";

function AdminPanelShell({ children }: { children: React.ReactNode }) {
  const sidebar = useStore(useSidebar, (x) => x);
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(max-width: 1024px)");
  const pathname = usePathname();
  const { isTransitioning } = useRouteTransition();
  if (!sidebar) return null;
  const { isOpen, toggleOpen, getOpenState, settings } = sidebar;

  return (
    <>
      <header
        className={cn(
          "border-b border-slate-200 dark:border-white/10 z-30 bg-sidebar shadow-sm sticky top-0 transition-[margin-left] ease-in-out duration-300",
          !settings.disabled && (!getOpenState() ? "lg:ml-[90px]" : "lg:ml-72")
        )}
      >
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6">
          
          {isMobile || isTablet ? (
            <SheetMenu />
          ) : (
            <SidebarToggle isOpen={isOpen} setIsOpen={toggleOpen} floating={false} />
          )}

          <div className="flex items-center gap-3">
            <div>

            </div>
          </div>

          <ModeToggle />
        </div>
      </header>
      <Sidebar />
      <main
        className={cn(
          "min-h-[calc(100vh_-_56px)]  transition-[margin-left] ease-in-out duration-300 mx-auto flex flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 overflow-x-hidden",
          !settings.disabled && (!getOpenState() ? "lg:ml-[90px]" : "lg:ml-72")
        )}
      >
        <motion.div
          key={pathname}
          initial={false}
          animate={{ opacity: isTransitioning ? 0 : 1 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          style={{ willChange: "opacity" }}
        >
          {children}
        </motion.div>
      </main>
      {/* <footer
        className={cn(
          "transition-[margin-left] ease-in-out duration-300",
          !settings.disabled && (!getOpenState() ? "lg:ml-[90px]" : "lg:ml-72")
        )}
      >
        <Footer />
      </footer> */}
    </>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteTransitionProvider>
      <AdminPanelShell>{children}</AdminPanelShell>
    </RouteTransitionProvider>
  );
}
