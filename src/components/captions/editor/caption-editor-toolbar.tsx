"use client";

import {
  Copy,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Volume2,
} from "lucide-react";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ResponsiveActionMenu, type ActionItem } from "@/components/controls/responsive-action-menu";

type CaptionEditorToolbarProps = {
  isMobileInspectorOpen?: boolean;
  canEditSelected?: boolean;
  isPlaying: boolean;
  volume: number;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  segmentCount: number;
  onTogglePlay: () => void;
  onVolumeChange: (value: number) => void;
  onAddSegment: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onEditSelected?: () => void;
};

export function CaptionEditorToolbar({
  canEditSelected,
  isPlaying,
  volume,
  canCopy,
  canPaste,
  canDelete,
  canUndo,
  canRedo,
  segmentCount,
  onTogglePlay,
  onVolumeChange,
  onAddSegment,
  onCopy,
  onPaste,
  onDelete,
  onUndo,
  onRedo,
  onZoomOut,
  onZoomIn,
  onEditSelected,
}: CaptionEditorToolbarProps) {
  const isMobile = useIsMobile();
  const mobileItems = useMemo<ActionItem[]>(
    () => [
      {
        label: isPlaying ? "Pause preview" : "Play preview",
        icon: isPlaying ? Pause : Play,
        onSelect: onTogglePlay,
      },
      { type: "separator" },
      {
        label: "Undo",
        icon: Undo2,
        onSelect: onUndo,
        disabled: !canUndo,
      },
      {
        label: "Redo",
        icon: Redo2,
        onSelect: onRedo,
        disabled: !canRedo,
      },
      { type: "separator" },
      {
        label: "Edit selected",
        icon: Pencil,
        onSelect: onEditSelected,
        disabled: !canEditSelected,
      },
      {
        label: "Add segment",
        icon: Plus,
        onSelect: onAddSegment,
      },
      {
        label: "Copy selected",
        icon: Copy,
        onSelect: onCopy,
        disabled: !canCopy,
      },
      {
        label: "Paste",
        icon: Copy,
        onSelect: onPaste,
        disabled: !canPaste,
      },
      {
        label: "Delete selected",
        icon: Trash2,
        onSelect: onDelete,
        disabled: !canDelete,
        destructive: true,
      },
      { type: "separator" },
      {
        label: "Zoom out",
        icon: Minus,
        onSelect: onZoomOut,
      },
      {
        label: "Zoom in",
        icon: Plus,
        onSelect: onZoomIn,
      },
    ],
    [
      canCopy,
      canDelete,
      canPaste,
      canRedo,
      canUndo,
      isPlaying,
      onAddSegment,
      onCopy,
      onDelete,
      onRedo,
      onEditSelected,
      onUndo,
      onPaste,
      onTogglePlay,
      onZoomIn,
      onZoomOut,
    ]
  );

  if (isMobile) {
    return (
        <div className="my-3 flex justify-between gap-2">
          <div className="flex flex-row justify-center items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onTogglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <div className="flex w-28 items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round(volume * 100)]}
                onValueChange={(next) => onVolumeChange((next[0] ?? 100) / 100)}
                />
            </div>
          </div>

          <div className="flex flex-row gap-2 justify-center items-center">
            <div className="text-xs text-muted-foreground">
              {segmentCount} segment{segmentCount === 1 ? "" : "s"}
            </div>
            <ResponsiveActionMenu items={mobileItems} title="Caption Actions" />
          </div>
        </div>
    );
  }

  return (
    <div className="my-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onTogglePlay}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <div className="flex w-36 items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(volume * 100)]}
            onValueChange={(next) => onVolumeChange((next[0] ?? 100) / 100)}
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {segmentCount} segment{segmentCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
