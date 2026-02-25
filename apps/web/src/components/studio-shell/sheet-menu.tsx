import { Link } from "@/components/navigation/route-transition";
import { useState } from "react";
import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Menu } from "@/components/studio-shell/menu";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { Logo } from "@/components/branding/logo";
import { APP_NAME } from "@/lib/shared/constants";
import {
  Sheet,
  SheetHeader,
  SheetContent,
  SheetTrigger,
  SheetTitle
} from "@/components/ui/sheet";

export function SheetMenu() {
  const [open, setOpen] = useState(false);
  const { connected, status } = useSocketIO();
  const indicatorStatus = connected ? "connected" : status;

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
              <Logo
                showText
                width={42}
                height={42}
                wrapperClassName="rounded-full"
                className="rounded-full"
              />
              <SheetTitle className="font-bold text-lg hidden">{APP_NAME}</SheetTitle>
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
                indicatorStatus === "connected"
                  ? "border-emerald-300/60"
                  : indicatorStatus === "connecting"
                    ? "border-amber-300/60"
                    : "border-rose-300/60"
              }`}
            >
              <span
                className={`absolute inset-0 rounded-full ${
                  indicatorStatus === "connected"
                    ? "animate-pulse bg-emerald-400/25"
                    : indicatorStatus === "connecting"
                      ? "animate-pulse bg-amber-400/25"
                      : "bg-rose-400/25"
                }`}
                style={{ animationDuration: "2.6s" }}
              />
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  indicatorStatus === "connected"
                    ? "bg-emerald-400"
                    : indicatorStatus === "connecting"
                      ? "bg-amber-400"
                      : "bg-rose-400"
                }`}
              />
            </span>
            {indicatorStatus === "connected"
              ? "Connected"
              : indicatorStatus === "connecting"
                ? "Connecting"
                : "Disconnected"}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
