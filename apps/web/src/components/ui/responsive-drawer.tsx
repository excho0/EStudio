"use client";

import * as React from "react";

import { cn } from "@/lib/shared/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ResponsiveRootProps = {
  children: React.ReactNode;
  className?: string;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
} & Pick<
  React.ComponentProps<typeof Drawer>,
  "open" | "defaultOpen" | "onOpenChange" | "modal"
>;

type ResponsiveTriggerProps = React.ComponentProps<typeof DrawerTrigger>;

type ResponsiveShellContentProps = Omit<
  React.ComponentProps<typeof DrawerContent>,
  "children"
> &
  Omit<React.ComponentProps<typeof DialogContent>, "children">;

type ResponsiveHeaderProps = React.ComponentProps<typeof DrawerHeader>;
type ResponsiveFooterProps = React.ComponentProps<typeof DrawerFooter>;
type ResponsiveTitleProps = React.ComponentProps<typeof DrawerTitle>;
type ResponsiveDescriptionProps = React.ComponentProps<typeof DrawerDescription>;
type ResponsiveCloseProps = React.ComponentProps<typeof DrawerClose>;
type ResponsiveContentProps = React.ComponentProps<"div">;

const isResponsiveDrawerTrigger = (
  child: React.ReactNode
): child is React.ReactElement<ResponsiveTriggerProps> =>
  React.isValidElement(child) && child.type === ResponsiveDrawerTrigger;

export function ResponsiveDrawer({
  children,
  className,
  closeOnOutsideClick = true,
  showCloseButton,
  open,
  defaultOpen,
  onOpenChange,
  modal,
  ...contentProps
}: ResponsiveRootProps & ResponsiveShellContentProps) {
  const isMobile = useIsMobile();
  const childArray = React.Children.toArray(children);
  const triggerChildren = childArray.filter(isResponsiveDrawerTrigger);
  const shellChildren = childArray.filter((child) => !isResponsiveDrawerTrigger(child));

  const shellProps = {
    className,
    ...contentProps,
  };

  if (isMobile) {
    return (
      <Drawer
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        modal={modal}
      >
        {triggerChildren}
        <DrawerContent
          onPointerDownOutside={(event) => {
            if (!closeOnOutsideClick) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (!closeOnOutsideClick) {
              event.preventDefault();
            }
          }}
          {...shellProps}
        >
          {shellChildren}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      {triggerChildren}
      <DialogContent
        showCloseButton={showCloseButton}
        onInteractOutside={(event) => {
          if (!closeOnOutsideClick) {
            event.preventDefault();
          }
        }}
        {...shellProps}
      >
        {shellChildren}
      </DialogContent>
    </Dialog>
  );
}

export function ResponsiveDrawerTrigger(props: ResponsiveTriggerProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerTrigger {...props} />;
  }
  return <DialogTrigger {...props} />;
}

export function ResponsiveDrawerContent({
  className,
  ...props
}: ResponsiveContentProps) {
  return (
    <div
      data-slot="responsive-drawer-content"
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

export function ResponsiveDrawerHeader(props: ResponsiveHeaderProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerHeader {...props} />;
  }
  return <DialogHeader {...props} />;
}

export function ResponsiveDrawerFooter(props: ResponsiveFooterProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerFooter {...props} />;
  }
  return <DialogFooter {...props} />;
}

export function ResponsiveDrawerTitle(props: ResponsiveTitleProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerTitle {...props} />;
  }
  return <DialogTitle {...props} />;
}

export function ResponsiveDrawerDescription(props: ResponsiveDescriptionProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerDescription {...props} />;
  }
  return <DialogDescription {...props} />;
}

export function ResponsiveDrawerClose(props: ResponsiveCloseProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerClose {...props} />;
  }
  return <DialogClose {...props} />;
}

ResponsiveDrawerTrigger.displayName = "ResponsiveDrawerTrigger";
