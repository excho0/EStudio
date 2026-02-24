"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/shared/utils";
import { Button } from "@/components/ui/button";
import { useRouteTransition } from "@/components/navigation/route-transition";
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
import { Checkbox } from "@/components/ui/checkbox";

export type ActionItem =
  | {
      type?: "item";
      label: string;
      icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
      iconClassName?: string;
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
      icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
      onConfirm: (options?: { keepRenders?: boolean }) => void;
      destructive?: boolean;
      confirmCheckbox?: {
        label: string;
        defaultChecked?: boolean;
        valueKey?: "keepRenders";
      };
    }
  | {
      type: "custom";
      render: (options: { close: () => void; isMobile: boolean }) => React.ReactNode;
    };

export function ResponsiveActionMenu({
  items,
  title = "Actions",
  triggerClassName,
  open,
  onOpenChange,
}: {
  items: ActionItem[];
  title?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1024px)");
  const isCompactLayout = isMobile || isTablet;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = typeof open === "boolean";
  const currentOpen = isControlled ? open : internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };
  const [confirmValues, setConfirmValues] = React.useState<Record<string, boolean>>(
    {}
  );
  const router = useRouter();
  const transition = useRouteTransition();
  const startTransition =
    transition?.startTransition ?? ((href: string) => router.push(href));

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

  if (isCompactLayout) {
    return (
      <Drawer
        open={currentOpen}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
        }}
      >
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

              if (item.type === "custom") {
                return (
                  <React.Fragment key={`custom-${index}`}>
                    {item.render({ close: () => setOpen(false), isMobile: true })}
                  </React.Fragment>
                );
              }

              if (item.type === "confirm") {
                const checkboxKey = item.confirmCheckbox?.valueKey ?? "keepRenders";
                const stateKey = `${item.label}:${checkboxKey}`;
                const checked =
                  confirmValues[stateKey] ?? item.confirmCheckbox?.defaultChecked ?? false;
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
                      {item.confirmCheckbox ? (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-start sm:text-left justify-center text-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setConfirmValues((current) => ({
                                ...current,
                                [stateKey]: value === true,
                              }));
                            }}
                          />
                          {item.confirmCheckbox.label}
                        </label>
                      ) : null}
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant={item.destructive ? "destructive" : "default"}
                          onClick={() => {
                            item.onConfirm(
                              item.confirmCheckbox
                                ? { [checkboxKey]: checked }
                                : undefined
                            );
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
                    className={cn(
                      "justify-start gap-2",
                      item.destructive && "text-red-600 hover:text-red-600"
                    )}
                    onClick={() => {
                      startTransition(href);
                      setOpen(false);
                    }}
                  >
                    <>
                      {item.icon ? (
                        <item.icon
                          className={cn("h-4 w-4 shrink-0", item.iconClassName)}
                        />
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
                    <item.icon
                      className={cn("h-4 w-4 shrink-0", item.iconClassName)}
                    />
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
    <DropdownMenu
      open={currentOpen}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, index) => {
          if (item.type === "separator") {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }

          if (item.type === "custom") {
            return (
              <React.Fragment key={`custom-${index}`}>
                {item.render({ close: () => setOpen(false), isMobile: false })}
              </React.Fragment>
            );
          }

          if (item.type === "confirm") {
            const checkboxKey = item.confirmCheckbox?.valueKey ?? "keepRenders";
            const stateKey = `${item.label}:${checkboxKey}`;
            const checked =
              confirmValues[stateKey] ?? item.confirmCheckbox?.defaultChecked ?? false;
            return (
              <AlertDialog key={`confirm-${item.label}`}>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                    onSelect={(event) => event.preventDefault()}
                  >
                    {item.icon ? (
                      <item.icon
                        className="h-4 w-4 shrink-0 text-red-600!"
                      />
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
                  {item.confirmCheckbox ? (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-start sm:text-left justify-center text-center">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setConfirmValues((current) => ({
                            ...current,
                            [stateKey]: value === true,
                          }));
                        }}
                      />
                      {item.confirmCheckbox.label}
                    </label>
                  ) : null}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        item.onConfirm(
                          item.confirmCheckbox
                            ? { [checkboxKey]: checked }
                            : undefined
                        );
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
                className={cn(
                  "flex items-center gap-2",
                  item.destructive && "text-red-600 focus:text-red-600"
                )}
                onSelect={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  startTransition(href);
                }}
              >
                {item.icon ? (
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.iconClassName,
                      item.destructive
                        ? "text-red-600!"
                        : "text-current"
                    )}
                  />
                ) : null}
                {item.label}
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={`action-${item.label}`}
              onSelect={() => {
                item.onSelect?.();
                setOpen(false);
              }}
              disabled={item.disabled}
              className={cn(
                "flex items-center gap-2",
                item.destructive && "text-red-600 focus:text-red-600"
              )}
            >
              {item.icon ? (
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    item.iconClassName,
                    item.destructive
                      ? "text-red-600"
                      : "text-current"
                  )}
                />
              ) : null}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
