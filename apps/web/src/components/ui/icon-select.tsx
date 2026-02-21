"use client";

import * as React from "react";

import { cn } from "@/lib/shared/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type IconLike =
  | React.ReactNode
  | React.ComponentType<React.SVGProps<SVGSVGElement>>;

export type IconSelectOption<TValue extends string> = {
  value: TValue;
  label: string;
  icon?: IconLike;
  disabled?: boolean;
};

type IconSelectProps<TValue extends string> = {
  value?: TValue;
  onValueChange: (value: TValue) => void;
  options: IconSelectOption<TValue>[];
  placeholder?: string;
  id?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

const renderIcon = (icon?: IconLike) => {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Icon = icon as React.ComponentType<React.SVGProps<SVGSVGElement>>;
  return <Icon className="h-4 w-4" />;
};

export function IconSelect<TValue extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  triggerClassName,
  contentClassName,
}: IconSelectProps<TValue>) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <span className="inline-flex items-center gap-2">
              {renderIcon(selected.icon)}
              {selected.label}
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            icon={renderIcon(option.icon)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
