"use client";

import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelWithTooltip } from "@/components/content-settings/label-with-tooltip";

export const SettingToggleRow = ({
  icon: Icon,
  label,
  tip,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tip: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label={`${label} info`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
  </div>
);

export const SettingSliderRow = ({
  id,
  label,
  tip,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onValueChange,
}: {
  id: string;
  label: string;
  tip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onValueChange: (value: number) => void;
}) => (
  <div className="flex flex-col gap-2 py-2">
    <div className="flex items-center justify-between">
      <LabelWithTooltip htmlFor={id} text={label} tip={tip} />
      <span>
        {value}
        {suffix ?? ""}
      </span>
    </div>
    <Slider
      id={id}
      min={min}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      onValueChange={(value) => onValueChange(value[0] ?? min)}
    />
  </div>
);

export const SettingRangeSliderRow = ({
  id,
  label,
  tip,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onValueChange,
  formatValue,
}: {
  id: string;
  label: string;
  tip: string;
  value: [number, number];
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onValueChange: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
}) => (
  <div className="flex flex-col gap-2 py-2">
    <div className="flex items-center justify-between">
      <LabelWithTooltip htmlFor={id} text={label} tip={tip} />
      <span>
        {formatValue ? formatValue(value[0]) : `${value[0]}${suffix ?? ""}`} - {formatValue ? formatValue(value[1]) : `${value[1]}${suffix ?? ""}`}
      </span>
    </div>
    <Slider
      id={id}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const start = next[0] ?? min;
        const end = next[1] ?? max;
        onValueChange([Math.min(start, end), Math.max(start, end)]);
      }}
    />
  </div>
);
