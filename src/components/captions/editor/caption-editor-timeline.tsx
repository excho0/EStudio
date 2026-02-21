"use client";

import type { CaptionSegment } from "@/types";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { cn } from "@/lib/shared/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Props = {
  isMobile: boolean;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  timelineScrollerRef: React.RefObject<HTMLDivElement | null>;
  timelineWidth: number;
  durationMs: number;
  cursorMs: number;
  tickMarks: number[];
  sortedSegments: CaptionSegment[];
  selectedIndices: number[];
  toSeconds: (ms: number) => string;
  suspendAutoFollow: (ms?: number) => void;
  onSetCursorFromClientX: (clientX: number, followViewport?: boolean) => void;
  onStartDrag: (event: React.PointerEvent<HTMLDivElement>, index: number, mode: "move" | "start" | "end") => void;
  onSelectSegment: (index: number, event: React.MouseEvent) => void;
  onWheelDelta: (delta: number) => void;
  getWheelPrimaryDelta: (event: Pick<WheelEvent, "deltaX" | "deltaY">) => number;
  onTogglePlay: () => void;
  onAddSegment: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onBeginNavigate: () => void;
};

export function CaptionEditorTimeline({
  isMobile,
  isPlaying,
  canUndo,
  canRedo,
  canCopy,
  canPaste,
  canDelete,
  timelineScrollerRef,
  timelineWidth,
  durationMs,
  cursorMs,
  tickMarks,
  sortedSegments,
  selectedIndices,
  toSeconds,
  suspendAutoFollow,
  onSetCursorFromClientX,
  onStartDrag,
  onSelectSegment,
  onWheelDelta,
  getWheelPrimaryDelta,
  onTogglePlay,
  onAddSegment,
  onCopy,
  onPaste,
  onDelete,
  onUndo,
  onRedo,
  onZoomOut,
  onZoomIn,
  onBeginNavigate,
}: Props) {
  const [viewport, setViewport] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    let rafId: number | null = null;
    const syncViewport = () => {
      rafId = null;
      const nextLeft = scroller.scrollLeft;
      const nextWidth = scroller.clientWidth;
      setViewport((prev) =>
        prev.left === nextLeft && prev.width === nextWidth
          ? prev
          : { left: nextLeft, width: nextWidth }
      );
    };
    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(syncViewport);
    };

    scheduleSync();
    const resizeObserver = new ResizeObserver(() => {
      const maxScrollLeft = Math.max(0, timelineWidth - scroller.clientWidth);
      if (scroller.scrollLeft > maxScrollLeft) {
        scroller.scrollLeft = maxScrollLeft;
      }
      scheduleSync();
    });
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    return () => {
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [timelineScrollerRef, timelineWidth]);

  const pxPerMs = timelineWidth / Math.max(durationMs, 1);
  const virtualPaddingPx = 480;
  const viewportLeft = Math.max(0, viewport.left - virtualPaddingPx);
  const viewportRight =
    viewport.width > 0
      ? viewport.left + viewport.width + virtualPaddingPx
      : Number.POSITIVE_INFINITY;

  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);

  const segmentPositions = useMemo(
    () =>
      sortedSegments.map((segment, index) => {
        const leftPx = segment.startMs * pxPerMs;
        const rightPx = segment.endMs * pxPerMs;
        return {
          segment,
          index,
          leftPx,
          rightPx,
          widthPx: Math.max(18, rightPx - leftPx),
        };
      }),
    [pxPerMs, sortedSegments]
  );

  const visibleTicks = useMemo(
    () =>
      tickMarks.filter((tickMs) => {
        const left = tickMs * pxPerMs;
        return left >= viewportLeft && left <= viewportRight;
      }),
    [pxPerMs, tickMarks, viewportLeft, viewportRight]
  );

  const visibleSegments = useMemo(() => {
    if (segmentPositions.length === 0) return [];

    let low = 0;
    let high = segmentPositions.length - 1;
    let firstVisible = segmentPositions.length;

    // Find first segment whose right edge enters the viewport window.
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (segmentPositions[mid]!.rightPx >= viewportLeft) {
        firstVisible = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (firstVisible === segmentPositions.length) return [];

    const result: (typeof segmentPositions)[number][] = [];
    for (let i = firstVisible; i < segmentPositions.length; i += 1) {
      const item = segmentPositions[i]!;
      if (item.leftPx > viewportRight) break;
      result.push(item);
    }
    return result;
  }, [segmentPositions, viewportLeft, viewportRight]);

  const body = (
    <div className="min-h-0 min-w-0 flex-1 select-none rounded-lg border bg-background p-2">
      <div
        ref={timelineScrollerRef}
        className="h-full overflow-x-auto overflow-y-hidden touch-none overscroll-none"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-caption-segment='true']")) return;
          onBeginNavigate();
          suspendAutoFollow(900);
          onSetCursorFromClientX(event.clientX, true);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          onBeginNavigate();
          suspendAutoFollow(900);
          onSetCursorFromClientX(event.clientX, true);
        }}
        onPointerUp={() => suspendAutoFollow(450)}
        onPointerCancel={() => suspendAutoFollow(450)}
        onTouchMove={(event) => event.preventDefault()}
        onWheel={(event) => {
          const el = event.currentTarget;
          const hasHorizontalOverflow = el.scrollWidth > el.clientWidth;
          if (!hasHorizontalOverflow) return;
          const delta = getWheelPrimaryDelta(event.nativeEvent);
          if (Math.abs(delta) === 0) return;
          onBeginNavigate();
          suspendAutoFollow(900);
          event.preventDefault();
          onWheelDelta(delta);
        }}
      >
        <div className="pr-3" style={{ width: timelineWidth }}>
          <div className="relative h-8 select-none border-b">
            {visibleTicks.map((tickMs) => {
              const left = tickMs * pxPerMs;
              return (
                <div
                  key={tickMs}
                  className="absolute top-0 h-full border-l border-border/60"
                  style={{ left }}
                >
                  <span className="absolute left-1 top-1 text-[10px] text-muted-foreground">
                    {toSeconds(tickMs)}s
                  </span>
                </div>
              );
            })}
            <div
              className="absolute top-0 h-full w-px bg-primary/80"
              style={{ left: `${cursorMs * pxPerMs}px` }}
            />
            <div
              className="absolute -top-5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
              style={{ left: `${cursorMs * pxPerMs}px` }}
            >
              {toSeconds(cursorMs)}s
            </div>
          </div>
          <div
            className={cn(
              "relative select-none rounded-md bg-muted/30 [contain:layout_paint_style]",
              isMobile ? "h-44" : "h-56"
            )}
          >
            <div
              className="absolute inset-y-0 z-10 w-px bg-primary/80"
              style={{ left: `${cursorMs * pxPerMs}px` }}
            />
            {visibleSegments.map(({ segment, index, leftPx, widthPx }) => {
              const selected = selectedSet.has(index);
              return (
                <div
                  key={`${segment.startMs}-${segment.endMs}-${index}`}
                  data-caption-segment="true"
                  className={cn(
                    "absolute top-4 h-14 cursor-grab select-none rounded-md border bg-primary/15 active:cursor-grabbing will-change-transform",
                    selected && "border-primary ring-1 ring-primary/50"
                  )}
                  style={{ width: widthPx, transform: `translate3d(${leftPx}px, 0, 0)` }}
                  onPointerDown={(event) => onStartDrag(event, index, "move")}
                  onClick={(event) => {
                    onBeginNavigate();
                    onSelectSegment(index, event);
                  }}
                >
                  <div
                    className="absolute left-0 top-0 h-full w-2 rounded-l-md bg-primary/35"
                    onPointerDown={(event) => {
                      onBeginNavigate();
                      onStartDrag(event, index, "start");
                    }}
                  />
                  <div className={cn("h-full overflow-hidden px-3 py-2", isMobile ? "text-[10px]" : "text-xs")}>
                    <p className="truncate font-medium">{segment.text || "Untitled"}</p>
                    {!isMobile ? (
                      <p className="text-muted-foreground">
                        {toSeconds(segment.startMs)}s - {toSeconds(segment.endMs)}s
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full w-2 rounded-r-md bg-primary/35"
                    onPointerDown={(event) => {
                      onBeginNavigate();
                      onStartDrag(event, index, "end");
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={onTogglePlay}>
          {isPlaying ? "Pause preview" : "Play preview"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canUndo} onClick={onUndo}>
          Undo
        </ContextMenuItem>
        <ContextMenuItem disabled={!canRedo} onClick={onRedo}>
          Redo
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onAddSegment}>Add segment</ContextMenuItem>
        <ContextMenuItem disabled={!canCopy} onClick={onCopy}>
          Copy selected
        </ContextMenuItem>
        <ContextMenuItem disabled={!canPaste} onClick={onPaste}>
          Paste
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!canDelete}
          onClick={onDelete}
        >
          Delete selected
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onZoomOut}>Zoom out</ContextMenuItem>
        <ContextMenuItem onClick={onZoomIn}>Zoom in</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
