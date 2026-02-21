"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/shared/utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export const title = "Date Picker with Month and Year Selector";

type DatePickerStandard2Props = {
  value?: Date;
  onChange?: (date?: Date) => void;
  disabled?: boolean;
  buttonClassName?: string;
  hideHeader?: boolean;
  hideCalendarCaption?: boolean;
};

type PickerView = "calendar" | "month" | "year";

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];


const DatePickerStandard2 = ({
  value,
  onChange,
  disabled,
  buttonClassName,
  hideHeader = false,
  hideCalendarCaption = false,
}: DatePickerStandard2Props) => {
  const [internalDate, setInternalDate] = useState<Date | undefined>(undefined);
  const [month, setMonth] = useState<Date>(value ?? new Date());
  const [view, setView] = useState<PickerView>("calendar");
  const date = value ?? internalDate;

  const timeValue =
    date && !Number.isNaN(date.getTime()) ? format(date, "HH:mm") : "00:00";

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    if (!date) return;
    const [hours, minutes] = nextValue.split(":");
    if (!hours || !minutes) return;
    const newDate = new Date(date);
    newDate.setHours(
      Number.parseInt(hours, 10),
      Number.parseInt(minutes, 10),
    );
    setDate(newDate);
  };

  const setDate = (next: Date | undefined) => {
    if (onChange) {
      onChange(next);
      return;
    }
    setInternalDate(next);
  };

  const formatted = useMemo(() => {
    if (!date || Number.isNaN(date.getTime())) return null;
    return format(date, "PPP");
  }, [date]);

  const yearOptions = useMemo(() => {
    const currentYear = (date ?? new Date()).getFullYear();
    const range = 15;
    return Array.from({ length: range * 2 + 1 }, (_, index) => currentYear - range + index);
  }, [date]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !date && "text-muted-foreground",
            buttonClassName,
          )}
          variant="outline"
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatted ? `${formatted} at ${timeValue}` : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {!hideHeader && (
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            {view !== "calendar" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setView("calendar")}
              >
                Back
              </Button>
            ) : null}
            {view !== "month" ? (
              <Button
                type="button"
                size="sm"
                variant={view === "year" ? "secondary" : "ghost"}
                onClick={() => setView("month")}
              >
                {monthLabels[month.getMonth()]}
              </Button>
            ) : null}
            {view !== "year" ? (
              <Button
                type="button"
                size="sm"
                variant={view === "month" ? "secondary" : "ghost"}
                onClick={() => setView("year")}
              >
                {month.getFullYear()}
              </Button>
            ) : null}
          </div>
        )}

        {hideHeader || view === "calendar" ? (
          <div>
            <Calendar
              captionLayout="label"
              hideNavigation
              hideCaption
              mode="single"
              month={month}
              onMonthChange={setMonth}
              onSelect={(next) => {
                setDate(next);
                if (next) {
                  setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
                }
              }}
              selected={date}
              classNames={
                hideCalendarCaption
                  ? {
                      caption: "hidden",
                      caption_label: "hidden",
                    }
                  : undefined
              }
            />
            <Separator />
            <div className="space-y-2 p-4">
              <Label htmlFor="time">Time</Label>
              <Input
                className="w-full"
                id="time"
                onChange={handleTimeChange}
                type="time"
                lang="en-GB"
                step={60}
                value={timeValue}
              />
            </div>
          </div>

        ) : view === "month" ? (
          <div className="grid grid-cols-3 gap-2 p-3">
            {monthLabels.map((label, index) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={month.getMonth() === index ? "secondary" : "ghost"}
                onClick={() => {
                  setMonth(new Date(month.getFullYear(), index, 1));
                  setView("calendar");
                }}
              >
                {label.slice(0, 3)}
              </Button>
            ))}
          </div>
        ) : (
          <div
            className="max-h-56 overflow-y-auto overscroll-contain p-3"
            onWheel={(event) => {
              event.stopPropagation();
            }}
            onTouchMove={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {yearOptions.map((year) => (
                <Button
                  key={year}
                  type="button"
                  size="sm"
                  variant={month.getFullYear() === year ? "secondary" : "ghost"}
                  onClick={() => {
                    setMonth(new Date(year, month.getMonth(), 1));
                    setView("calendar");
                  }}
                >
                  {year}
                </Button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default DatePickerStandard2;
