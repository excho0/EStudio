"use client";

import {
  Captions,
  Check,
  Clipboard,
  Copy,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  SquareDashedMousePointer,
  SquareMousePointer,
  Trash2,
  Undo2,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ResponsiveActionMenu, type ActionItem } from "@/components/controls/responsive-action-menu";

type CaptionEditorToolbarProps = {
  isMobileInspectorOpen?: boolean;
  isMobileSelectionMode?: boolean;
  selectedCount?: number;
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
  onToggleMobileSelectionMode?: () => void;
};

export function CaptionEditorToolbar({
  isMobileSelectionMode = false,
  selectedCount = 0,
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
  onToggleMobileSelectionMode,
}: CaptionEditorToolbarProps) {
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1024px)");
  const isCompactLayout = isMobile || isTablet;
  const [mobileVolumeOpen, setMobileVolumeOpen] = useState(false);
  const mobileItems = useMemo<ActionItem[]>(
    () => [
      // {
      //   label: isPlaying ? "Pause preview" : "Play preview",
      //   icon: isPlaying ? Pause : Play,
      //   onSelect: onTogglePlay,
      // },
      // { type: "separator" },
      // {
      //   label: "Undo",
      //   icon: Undo2,
      //   onSelect: onUndo,
      //   disabled: !canUndo,
      // },
      // {
      //   label: "Redo",
      //   icon: Redo2,
      //   onSelect: onRedo,
      //   disabled: !canRedo,
      // },
      // { type: "separator" },
      {
        label: "Add segment",
        icon: Plus,
        onSelect: onAddSegment,
      },
      {
        label: "Edit selected",
        icon: Pencil,
        onSelect: onEditSelected,
        disabled: !canEditSelected,
      },
      { type: "separator" },
      {
        label: "Copy selected",
        icon: Clipboard,
        onSelect: onCopy,
        disabled: !canCopy,
      },
      {
        label: "Paste",
        icon: Copy,
        onSelect: onPaste,
        disabled: !canPaste,
      },
      { type: "separator" },
      {
        label: "Delete selected",
        icon: Trash2,
        onSelect: onDelete,
        disabled: !canDelete,
        destructive: true,
      },
      // { type: "separator" },
      // {
      //   label: "Zoom out",
      //   icon: Minus,
      //   onSelect: onZoomOut,
      // },
      // {
      //   label: "Zoom in",
      //   icon: Plus,
      //   onSelect: onZoomIn,
      // },
    ],
    [
      canCopy,
      canDelete,
      canPaste,
      canRedo,
      canUndo,
      // isPlaying,
      onAddSegment,
      onCopy,
      onDelete,
      // onRedo,
      onEditSelected,
      // onUndo,
      onPaste,
      onTogglePlay,
      onZoomIn,
      onZoomOut,
    ]
  );

  if (isCompactLayout) {
    return (
        <div className="my-3 flex justify-between gap-2">
          <div className="flex flex-row justify-center items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onTogglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {/* {isPlaying ? "Pause" : "Play"} */}
            </Button>
            <Button
              type="button"
              variant={mobileVolumeOpen ? "default" : "outline"}
              size="icon-sm"
              aria-label="Toggle volume slider"
              onClick={() => setMobileVolumeOpen((current) => !current)}
            >
              <Volume2 className="h-4 w-4" />
            </Button>
            <AnimatePresence initial={false}>
              {mobileVolumeOpen ? (
                <motion.div
                  key="mobile-volume-slider"
                  initial={{ opacity: 0, x: -14, width: 0 }}
                  animate={{ opacity: 1, x: 0, width: 112 }}
                  exit={{ opacity: 0, x: -10, width: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center"
                >
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(volume * 100)]}
                    onValueChange={(next) => onVolumeChange((next[0] ?? 100) / 100)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex flex-row gap-2 justify-center items-center">
            <Button
              type="button"
              variant={isMobileSelectionMode ? "default" : "outline"}
              size="sm"
              onClick={onToggleMobileSelectionMode}
            >
              {isMobileSelectionMode ? <SquareMousePointer className="h-4 w-4" /> : <SquareDashedMousePointer className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
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
          {/* {isPlaying ? "Pause" : "Play"} */}
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
      <div className="flex flex-row gap-2">
        <div className="flex flex-row gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5">
          <Captions className="h-4 w-4 flex shrink-0 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Timeline
          </span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
          <span className="text-sm font-semibold tabular-nums">{segmentCount}</span>
          <span className="text-xs text-muted-foreground">
            segment{segmentCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
