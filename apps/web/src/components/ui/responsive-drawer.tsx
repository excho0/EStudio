"use client";

import * as React from "react";

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

type ResponsiveRootProps = React.ComponentProps<typeof Drawer> &
  React.ComponentProps<typeof Dialog>;

type ResponsiveTriggerProps = React.ComponentProps<typeof DrawerTrigger>;

type ResponsiveContentProps = React.ComponentProps<typeof DrawerContent> &
  React.ComponentProps<typeof DialogContent>;

type ResponsiveHeaderProps = React.ComponentProps<typeof DrawerHeader>;
type ResponsiveFooterProps = React.ComponentProps<typeof DrawerFooter>;
type ResponsiveTitleProps = React.ComponentProps<typeof DrawerTitle>;
type ResponsiveDescriptionProps = React.ComponentProps<typeof DrawerDescription>;
type ResponsiveCloseProps = React.ComponentProps<typeof DrawerClose>;

export function ResponsiveDrawer(props: ResponsiveRootProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <Drawer {...props} />;
  }
  return <Dialog {...props} />;
}

export function ResponsiveDrawerTrigger(props: ResponsiveTriggerProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DrawerTrigger {...props} />;
  }
  return <DialogTrigger {...props} />;
}

export function ResponsiveDrawerContent({
  closeOnOutsideClick = true,
  showCloseButton,
  ...props
}: ResponsiveContentProps & {
  showCloseButton?: boolean;
  closeOnOutsideClick?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
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
        {...props}
      />
    );
  }
  return (
    <DialogContent
      showCloseButton={showCloseButton}
      onInteractOutside={(event) => {
        if (!closeOnOutsideClick) {
          event.preventDefault();
        }
      }}
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
