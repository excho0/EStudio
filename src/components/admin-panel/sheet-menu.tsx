import Link from "next/link";
import { useState } from "react";
import { MenuIcon, PanelsTopLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Menu } from "@/components/admin-panel/menu";
import { useDashboardSocket } from "@/app/dashboard/_components/dashboard-socket";
import {
  Sheet,
  SheetHeader,
  SheetContent,
  SheetTrigger,
  SheetTitle
} from "@/components/ui/sheet";

export function SheetMenu() {
  const [open, setOpen] = useState(false);
  const { connected } = useDashboardSocket();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="lg:hidden" asChild>
        <Button className="h-8" variant="outline" size="icon">
          <MenuIcon size={20} />
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:w-72 px-3 h-full flex min-h-0 flex-col" side="left">
        <SheetHeader>
          <Button
            className="flex justify-center items-center pb-2 pt-1"
            variant="link"
            asChild
          >
            <Link href="/dashboard" className="flex items-center gap-2">
              <PanelsTopLeft className="w-6 h-6 mr-1" />
              <SheetTitle className="font-bold text-lg">Excho Studio</SheetTitle>
            </Link>
          </Button>
        </SheetHeader>
        <Menu
          isOpen
          onNavigate={() => setOpen(false)}
          className="min-h-0 flex-1"
          variant="sheet"
        />
        <div className="mt-auto px-2 pb-8">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
