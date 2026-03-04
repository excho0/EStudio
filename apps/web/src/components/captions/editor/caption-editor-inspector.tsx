"use client";

import { SquareDashedMousePointer, Trash2 } from "lucide-react";
import type { CaptionSegment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  sortedSegmentsLength: number;
  selectedIndices: number[];
  selectedIndex: number | null;
  selectedSegment: CaptionSegment | null;
  onRemoveSelected: () => void;
  onRemoveSingle: (index: number) => void;
  toSeconds: (ms: number) => string;
  toMs: (seconds: string, fallbackMs: number) => number;
  setSegmentTiming: (index: number, startMs: number, endMs: number) => void;
  updateSegmentText: (index: number, text: string) => void;
};

export function CaptionEditorInspector({
  sortedSegmentsLength,
  selectedIndices,
  selectedIndex,
  selectedSegment,
  onRemoveSelected,
  onRemoveSingle,
  toSeconds,
  toMs,
  setSegmentTiming,
  updateSegmentText,
}: Props) {
  if (sortedSegmentsLength === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No caption segments yet. Add one to start editing.
      </div>
    );
  }

  if (selectedIndices.length > 1) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{selectedIndices.length} segments selected</p>
          <Tooltip disableMobileDrawer delayDuration={100}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-red-500 hover:text-red-500"
                onClick={onRemoveSelected}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              Remove all selected segments
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Multi-select mode is active. Use keyboard shortcuts:
          <div className="mt-2 space-y-1">
            <div>`Ctrl/Cmd + C` copy selected</div>
            <div>`Ctrl/Cmd + V` paste at cursor</div>
            <div>`Delete` remove selected</div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedSegment || selectedIndex === null) {
    return (
      <div className="flex flex-col gap-2 h-full items-center text-center justify-center rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <SquareDashedMousePointer className="flex shrink-0" />
        <span>Select a segment from timeline to edit.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Segment {selectedIndex + 1}</p>
        <Tooltip disableMobileDrawer delayDuration={100}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-red-500 hover:text-red-500"
              onClick={() => onRemoveSingle(selectedIndex)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Remove segment
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Start (sec)</label>
          <Input
            value={toSeconds(selectedSegment.startMs)}
            onChange={(event) =>
              setSegmentTiming(
                selectedIndex,
                toMs(event.target.value, selectedSegment.startMs),
                selectedSegment.endMs
              )
            }
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">End (sec)</label>
          <Input
            value={toSeconds(selectedSegment.endMs)}
            onChange={(event) =>
              setSegmentTiming(
                selectedIndex,
                selectedSegment.startMs,
                toMs(event.target.value, selectedSegment.endMs)
              )
            }
          />
        </div>
      </div>

      <div className="mt-2 grid gap-1">
        <label className="text-xs text-muted-foreground">Text</label>
        <Textarea
          value={selectedSegment.text}
          className="min-h-20"
          onChange={(event) => updateSegmentText(selectedIndex, event.target.value)}
        />
      </div>
    </div>
  );
}

