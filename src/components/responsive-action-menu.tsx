"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRouteTransition } from "@/components/route-transition";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ActionItem =
  | {
      type?: "item";
      label: string;
      icon?: React.ComponentType<{ className?: string }>;
      onSelect?: () => void;
      href?: string;
      disabled?: boolean;
      destructive?: boolean;
    }
  | { type: "separator" }
  | {
      type: "confirm";
      label: string;
      description: string;
      icon?: React.ComponentType<{ className?: string }>;
      onConfirm: () => void;
      destructive?: boolean;
    };

export function ResponsiveActionMenu({
  items,
  title = "Actions",
  triggerClassName,
}: {
  items: ActionItem[];
  title?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const { startTransition } = useRouteTransition();

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10",
        triggerClassName
      )}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-6 pb-6">
            {items.map((item, index) => {
              if (item.type === "separator") {
                return (
                  <div key={`separator-${index}`} className="my-1 h-px bg-border" />
                );
              }

              if (item.type === "confirm") {
                return (
                  <AlertDialog key={`confirm-${item.label}`}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          "justify-start gap-2",
                          item.destructive && "text-red-600 hover:text-red-600"
                        )}
                      >
                        {item.icon ? (
                          <item.icon className="h-4 w-4 shrink-0" />
                        ) : null}
                        {item.label}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{item.label}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {item.description}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className={cn(
                            item.destructive && "bg-red-600 text-white hover:bg-red-500"
                          )}
                          onClick={() => {
                            item.onConfirm();
                            setOpen(false);
                          }}
                        >
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                );
              }

              if (item.href) {
                const href = item.href;
                return (
                  <Button
                    key={`link-${item.label}`}
                    variant="ghost"
                    className="justify-start gap-2"
                    onClick={() => {
                      startTransition(href);
                      setOpen(false);
                    }}
                  >
                    <>
                      {item.icon ? (
                        <item.icon className="h-4 w-4 shrink-0" />
                      ) : null}
                      {item.label}
                    </>
                  </Button>
                );
              }

              return (
                <Button
                  key={`action-${item.label}`}
                  variant="ghost"
                  className={cn(
                    "justify-start gap-2",
                    item.destructive && "text-red-600 hover:text-red-600"
                  )}
                  onClick={() => {
                    item.onSelect?.();
                    setOpen(false);
                  }}
                  disabled={item.disabled}
                >
                  {item.icon ? (
                    <item.icon className="h-4 w-4 shrink-0" />
                  ) : null}
                  {item.label}
                </Button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, index) => {
          if (item.type === "separator") {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }

          if (item.type === "confirm") {
            return (
              <AlertDialog key={`confirm-${item.label}`}>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                    onSelect={(event) => event.preventDefault()}
                  >
                    {item.icon ? (
                      <item.icon className="h-4 w-4 shrink-0" />
                    ) : null}
                    {item.label}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{item.label}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {item.description}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className={cn(
                        item.destructive && "bg-red-600 text-white hover:bg-red-500"
                      )}
                      onClick={() => {
                        item.onConfirm();
                        setOpen(false);
                      }}
                    >
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );
          }

          if (item.href) {
            const href = item.href;
            return (
              <DropdownMenuItem
                key={`link-${item.label}`}
                className="flex items-center gap-2"
                onSelect={(event) => {
                  event.preventDefault();
                  startTransition(href);
                }}
              >
                {item.icon ? (
                  <item.icon className="h-4 w-4 shrink-0" />
                ) : null}
                {item.label}
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={`action-${item.label}`}
              onSelect={() => item.onSelect?.()}
              disabled={item.disabled}
            >
              <span className="flex items-center gap-2">
                {item.icon ? (
                  <item.icon className="h-4 w-4 shrink-0" />
                ) : null}
                {item.label}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
