"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Folder,
  Settings,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { DashboardSocketProvider, useDashboardSocket } from "./dashboard-socket";
import { ModeToggle } from "@/components/mode-toggle";

const navItems = [
  { title: "Overview", href: "/dashboard", icon: Activity },
  { title: "Library", href: "/dashboard/library", icon: Folder },
  { title: "Upload", href: "/dashboard/upload", icon: Upload },
  { title: "Preview", href: "/dashboard/preview", icon: Sparkles },
];

const settingsItems = [
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

function SidebarStatus() {
  const { connected } = useDashboardSocket();

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
      <span
        className={`relative flex h-3 w-3 items-center justify-center rounded-full border ${
          connected ? "border-emerald-300/60" : "border-amber-300/60"
        }`}
      >
        <span
          className={`absolute inset-0 rounded-full ${
            connected
              ? "animate-pulse bg-emerald-400/25"
              : "animate-pulse bg-amber-400/25"
          }`}
          style={{ animationDuration: "2.6s" }}
        />
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
      </span>

      {connected ? "Connected" : "Connecting"}
    </div>
  );
}

function SidebarNavGroup({
  label,
  items,
}: {
  label: string;
  items: { title: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
                <Link href={item.href} onClick={handleNavClick}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardSocketProvider>
      <SidebarProvider className="min-h-svh bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-50">
        <Sidebar className="border-r border-slate-200 bg-white dark:border-white/10 dark:bg-zinc-950">
          <SidebarHeader className="gap-2 px-4 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">
                Excho Studio
              </p>
              <p className="text-lg font-semibold">Content Manager</p>
            </div>
            <SidebarStatus />
          </SidebarHeader>
          <SidebarContent className="px-2 py-4">
            <SidebarNavGroup label="Studio" items={navItems} />
            <SidebarNavGroup label="Settings" items={settingsItems} />
          </SidebarContent>
          <SidebarFooter className="px-4 py-4 text-xs text-slate-500 dark:text-zinc-400">
            Filesystem storage enabled
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="border-b border-slate-200 dark:border-white/10">
            <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
              <SidebarTrigger variant={"outline"} className=" p-4 border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10" />
              
              <div className="flex items-center gap-3">
                <div>

                </div>
              </div>

              <ModeToggle />
            </div>
          </header>
          <div className="mx-auto flex w-full flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 overflow-x-hidden">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </DashboardSocketProvider>
  );
}
