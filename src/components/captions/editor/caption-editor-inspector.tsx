"use client";

import { Trash2 } from "lucide-react";
import type { CaptionSegment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-red-500 hover:text-red-500"
            onClick={onRemoveSelected}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
      <div className="flex h-full items-center justify-center rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Select a segment from timeline to edit.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Segment {selectedIndex + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-red-500 hover:text-red-500"
          onClick={() => onRemoveSingle(selectedIndex)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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

