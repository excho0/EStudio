"use client";

import {
  Captions,
  Clipboard,
  Copy,
  Loader2,
  Monitor,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  SquareDashedMousePointer,
  SquareMousePointer,
  Trash2,
  Undo2,
  Volume2
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveActionMenu, type ActionItem } from "@/components/controls/responsive-action-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentModePreviewVariant } from "@/lib/content/modes/ui-registry";

type CaptionEditorToolbarProps = {
  isMobileInspectorOpen?: boolean;
  isMobileSelectionMode?: boolean;
  canEditSelected?: boolean;
  isPlaying: boolean;
  volume: number;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  segmentCount: number;
  onGenerateSegments?: () => void;
  isGeneratingSegments?: boolean;
  onTogglePlay: () => void;
  onVolumeChange: (value: number) => void;
  onAddSegment: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEditSelected?: () => void;
  onToggleMobileSelectionMode?: () => void;
  onOpenGlobalOffsetEditor?: () => void;
  previewModes?: ContentModePreviewVariant[];
  activePreviewMode?: ContentModePreviewVariant["id"];
  onSelectPreviewMode?: (mode: ContentModePreviewVariant["id"]) => void;
};

export function CaptionEditorToolbar({
  isMobileSelectionMode = false,
  canEditSelected,
  isPlaying,
  volume,
  canCopy,
  canPaste,
  canDelete,
  canUndo,
  canRedo,
  segmentCount,
  onGenerateSegments,
  isGeneratingSegments = false,
  onTogglePlay,
  onVolumeChange,
  onAddSegment,
  onCopy,
  onPaste,
  onDelete,
  onUndo,
  onRedo,
  onEditSelected,
  onToggleMobileSelectionMode,
  onOpenGlobalOffsetEditor,
  previewModes = [],
  activePreviewMode = "full",
  onSelectPreviewMode,
}: CaptionEditorToolbarProps) {
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1024px)");
  const isCompactLayout = isMobile || isTablet;
  const [mobileVolumeOpen, setMobileVolumeOpen] = useState(false);
  const hasNoCaptions = segmentCount === 0;

  const triggerGenerateFromMenu = useCallback(() => {
    if (!onGenerateSegments || isGeneratingSegments) return;
    onGenerateSegments();
  }, [isGeneratingSegments, onGenerateSegments]);
  const previewModeItems = useMemo<ActionItem[]>(
    () =>
      previewModes.map((mode) => ({
        label: activePreviewMode === mode.id ? `${mode.label} (Active)` : mode.label,
        icon: mode.icon,
        onSelect: () => onSelectPreviewMode?.(mode.id),
        disabled: activePreviewMode === mode.id,
      })),
    [activePreviewMode, onSelectPreviewMode, previewModes]
  );

  const activePreviewModeIcon = useMemo(() => {
    return previewModes.find((mode) => mode.id === activePreviewMode)?.icon;
  }, [activePreviewMode, previewModes]);

  const mobileItems = useMemo<ActionItem[]>(
    () => {
      const items: ActionItem[] = [];
      if (hasNoCaptions && onGenerateSegments) {
        items.push({
          label: "Generate captions",
          icon: Captions,
          onSelect: triggerGenerateFromMenu,
          disabled: isGeneratingSegments,
        });
        items.push({ type: "separator" });
      }
      items.push(
      {
        label: "Global offset",
        icon: SlidersHorizontal,
        onSelect: onOpenGlobalOffsetEditor,
        disabled: hasNoCaptions || !onOpenGlobalOffsetEditor,
      },
      { type: "separator" },
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
        disabled: hasNoCaptions,
      },
      {
        label: "Edit selected",
        icon: Pencil,
        onSelect: onEditSelected,
        disabled: hasNoCaptions || !canEditSelected,
      },
      { type: "separator" },
      {
        label: "Copy selected",
        icon: Clipboard,
        onSelect: onCopy,
        disabled: hasNoCaptions || !canCopy,
      },
      {
        label: "Paste",
        icon: Copy,
        onSelect: onPaste,
        disabled: hasNoCaptions || !canPaste,
      },
      { type: "separator" },
      {
        label: "Delete selected",
        icon: Trash2,
        onSelect: onDelete,
        disabled: hasNoCaptions || !canDelete,
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
      );
      return items;
    },
    [
      hasNoCaptions,
      isGeneratingSegments,
      canCopy,
      canDelete,
      canPaste,
      onAddSegment,
      onCopy,
      onDelete,
      onEditSelected,
      onGenerateSegments,
      onPaste,
      onOpenGlobalOffsetEditor,
      triggerGenerateFromMenu,
      canEditSelected,
    ]
  );

  if (isCompactLayout) {
    return (
      <>
        <div className="my-3 flex justify-between gap-2">
          <div className="flex flex-row justify-center items-center gap-2">
            <Tooltip disableMobileDrawer delayDuration={100}>
              <TooltipTrigger asChild>
                <Button type="button" variant="secondary" size="sm" onClick={onTogglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {/* {isPlaying ? "Pause" : "Play"} */}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isPlaying ? "Pause preview" : "Play preview"}
              </TooltipContent>
            </Tooltip>
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
            {previewModeItems.length > 0 ? (
              <ResponsiveActionMenu
                items={previewModeItems}
                title="Preview Mode"
                triggerIcon={activePreviewModeIcon ?? Monitor}
              />
            ) : null}
            <Button
              type="button"
              variant={isMobileSelectionMode ? "default" : "outline"}
              size="sm"
              onClick={onToggleMobileSelectionMode}
            >
              {isMobileSelectionMode ? <SquareMousePointer className="h-4 w-4" /> : <SquareDashedMousePointer className="h-4 w-4" />}
            </Button>
            <Tooltip disableMobileDrawer delayDuration={100}>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="top">Undo</TooltipContent>
            </Tooltip>
            <Tooltip disableMobileDrawer delayDuration={100}>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="top">Redo</TooltipContent>
            </Tooltip>
            <ResponsiveActionMenu items={mobileItems} title="Caption Actions" />
          </div>
        </div>
        <Dialog open={isGeneratingSegments}>
          <DialogContent
            showCloseButton={false}
            className="max-w-sm overflow-hidden rounded-2xl bg-linear-to-br from-background via-background to-primary/8  dark:from-zinc-950 dark:via-zinc-950 dark:to-primary/18"
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <div className="pointer-events-none absolute -top-18 -right-16 h-44 w-44 rounded-full bg-primary/18 blur-3xl dark:bg-primary/30" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-primary/12 blur-3xl dark:bg-primary/22" />
            <DialogHeader className="flex flex-row gap-2 items-center text-center justify-center">
              <Sparkles className="h-5 w-5 flex shrink-0 text-primary dark:text-primary/90" />
              <DialogTitle className="text-left text-lg">Generating Captions</DialogTitle>
            </DialogHeader>
            <div className="relative mt-1 flex items-center gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3 text-sm text-muted-foreground backdrop-blur-xs dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary-foreground">
                <Loader2 className="h-4 w-4 animate-spin dark:text-primary flex shrink-0" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground">Transcribing and aligning words...</span>
                <span className="text-xs text-muted-foreground">This can take a few seconds.</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="my-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <Tooltip disableMobileDrawer delayDuration={100}>
          <TooltipTrigger asChild>
            <Button type="button" variant="secondary" size="sm" onClick={onTogglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {/* {isPlaying ? "Pause" : "Play"} */}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isPlaying ? "Pause preview" : "Play preview"}
          </TooltipContent>
        </Tooltip>
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
          {previewModeItems.length > 0 ? (
            <ResponsiveActionMenu
              items={previewModeItems}
              title="Preview Mode"
              triggerIcon={activePreviewModeIcon}
            />
          ) : null}
          <Tooltip disableMobileDrawer delayDuration={100}>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="top">Undo</TooltipContent>
          </Tooltip>
          <Tooltip disableMobileDrawer delayDuration={100}>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="top">Redo</TooltipContent>
          </Tooltip>
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
    </>
  );
}
