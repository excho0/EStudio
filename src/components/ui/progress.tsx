"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/shared/utils"

type ProgressVariant =
  | "default"
  | "blue"
  | "green"
  | "rose"
  | "amber"
  | "violet";

const indicatorVariants: Record<ProgressVariant, string> = {
  default:
    "bg-primary shadow-[0_0_12px_rgba(56,189,248,0.35)] dark:shadow-[0_0_12px_rgba(56,189,248,0.45)]",
  blue:
    "bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.35)] dark:shadow-[0_0_12px_rgba(14,165,233,0.45)]",
  green:
    "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)] dark:shadow-[0_0_12px_rgba(16,185,129,0.45)]",
  rose:
    "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)] dark:shadow-[0_0_12px_rgba(244,63,94,0.45)]",
  amber:
    "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)] dark:shadow-[0_0_12px_rgba(251,191,36,0.45)]",
  violet:
    "bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.35)] dark:shadow-[0_0_12px_rgba(139,92,246,0.45)]",
}

function Progress({
  className,
  value,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  variant?: ProgressVariant
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/15 relative h-2 w-full overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(148,163,184,0.25)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 transition-[transform,box-shadow] duration-500 ease-out",
          indicatorVariants[variant]
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
