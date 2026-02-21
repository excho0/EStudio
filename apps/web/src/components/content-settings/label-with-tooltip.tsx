"use client";

import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const LabelWithTooltip = ({
  htmlFor,
  text,
  tip,
  invalid,
}: {
  htmlFor: string;
  text: string;
  tip: string;
  invalid?: boolean;
}) => (
  <div className="flex items-center gap-2">
    <Label htmlFor={htmlFor} className={invalid ? "text-rose-600 dark:text-rose-300" : undefined}>
      {text}
    </Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={[
            "text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300",
            invalid ? "text-rose-400 hover:text-rose-500 dark:text-rose-300" : "",
          ].join(" ")}
          aria-label={`${text} info`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {tip}
      </TooltipContent>
    </Tooltip>
  </div>
);
