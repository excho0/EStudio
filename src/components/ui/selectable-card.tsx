"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectableCardProps = {
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  indicatorClassName?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

export function SelectableCard({
  selected = false,
  disabled = false,
  className,
  indicatorClassName,
  onClick,
  children,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={cn(
        "group w-full rounded-2xl border p-4 text-left transition-all",
        "hover:border-slate-400/70 hover:shadow-md",
        "dark:hover:border-white/20",
        selected
          ? "border-slate-900/80 shadow-lg ring-1 ring-slate-900/10 dark:border-white/40 dark:ring-white/20"
          : "border-slate-200 dark:border-white/10",
        disabled && "cursor-not-allowed opacity-70",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border",
            selected
              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
              : "border-slate-200 text-transparent dark:border-white/20",
            indicatorClassName
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
