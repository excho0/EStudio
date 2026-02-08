"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SelectableCard } from "@/components/ui/selectable-card";


import { cn } from "@/lib/shared/utils";

const ThemeSkeleton = ({ variant }: { variant: "light" | "dark" | "system" }) => {
  if (variant === "system") {
    return (
      <div className="relative h-28 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <div className="absolute inset-0 bg-white rounded-2xl" />
        <div
          className="absolute inset-0 bg-slate-900"
          style={{ clipPath: "polygon(52% 0%, 100% 0%, 100% 100%, 45% 100%)" }}
        />
        <div className="relative z-10 grid h-full grid-cols-2 gap-0">
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3 w-3/4 rounded-full bg-slate-200" />
            <div className="h-3 w-5/6 rounded-full bg-slate-200" />
            <div className="mt-auto space-y-2">
              <div className="h-5 w-26 rounded-lg bg-slate-100" />
              <div className="h-5 w-4/5 rounded-lg bg-slate-100" />
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3">
            <div className="h-3 w-3/4 rounded-full bg-slate-700/70" />
            <div className="h-3 w-5/6 rounded-full bg-slate-700/70" />
            <div className="mt-auto space-y-2">
              <div className="h-5 w-full rounded-lg bg-slate-800/80" />
              <div className="h-5 w-4/5 rounded-lg bg-slate-800/80" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const base =
    variant === "dark"
      ? "bg-slate-900 border-slate-700/70"
      : "bg-white border-slate-200";
  const bar = variant === "dark" ? "bg-slate-700/70" : "bg-slate-200";
  const card = variant === "dark" ? "bg-slate-800/80" : "bg-slate-100";

  return (
    <div className={cn("h-28 w-full rounded-2xl border p-3", base)}>
      <div className="space-y-2">
        <div className={cn("h-3 w-3/5 rounded-full", bar)} />
        <div className={cn("h-3 w-4/5 rounded-full", bar)} />
      </div>
      <div className="mt-4 space-y-2">
        <div className={cn("h-5 w-full rounded-lg", card)} />
        <div className={cn("h-4 w-4/5 rounded-lg", card)} />
      </div>
    </div>
  );
};

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();

  const options = useMemo(
    () => [
      {
        key: "light" as const,
        label: "Light",
        description: "Clean, bright interface",
      },
      {
        key: "dark" as const,
        label: "Dark",
        description: "Low‑glare, cinematic UI",
      },
      {
        key: "system" as const,
        label: "System",
        description: "Match your OS",
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
  
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex shrink-0 h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Palette className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Appearance
            </h2>

            <p className="text-sm text-muted-foreground">
              Choose how the application looks and feels.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 mt-6">
          {options.map((option) => {
            const active = theme === option.key;
            return (
              <SelectableCard
                key={option.key}
                selected={active}
                onClick={() => setTheme(option.key)}
              >
                <div>
                  <p className="text-base font-semibold">{option.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.description}
                  </p>
                  <div className="mt-4">
                    <ThemeSkeleton variant={option.key} />
                  </div>
                </div>
              </SelectableCard>
            );
          })}
        </div>

      </Card>
    </div>
  );
}
