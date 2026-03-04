"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Info, RotateCw, Save } from "lucide-react";
import type { PlayerRef } from "@remotion/player";
import type { CaptionDocument, CaptionSegment } from "@/types";
import { captionDocumentSchema } from "@/types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/components/navigation/route-transition";
import { cn } from "@/lib/shared/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  CaptionEditorPreview,
  type CaptionEditorPreviewProps,
} from "./editor/caption-editor-preview";
import { CaptionEditorToolbar } from "./editor/caption-editor-toolbar";
import { CaptionEditorTimeline } from "./editor/caption-editor-timeline";
import { CaptionEditorInspector } from "./editor/caption-editor-inspector";
import { useCaptionEditorShortcuts } from "./editor/use-caption-editor-shortcuts";
import type { ContentModePreviewVariant } from "@/lib/content/modes/ui-registry";

type CaptionEditorDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CaptionDocument | null;
  mode: string;
  language: string;
  onSave: (next: CaptionDocument, options?: { source?: "manual" | "autosave" }) => Promise<void> | void;
  preview: CaptionEditorPreviewProps | null;
  previewModes?: ContentModePreviewVariant[];
};

export type CaptionEditorProps = {
  value: CaptionDocument | null;
  mode: string;
  language: string;
  onSave: (next: CaptionDocument, options?: { source?: "manual" | "autosave" }) => Promise<void> | void;
  preview: CaptionEditorPreviewProps | null;
  previewModes?: ContentModePreviewVariant[];
  active?: boolean;
  onRequestClose?: () => void;
  closeHref?: string;
  className?: string;
};

type DragMode = "move" | "start" | "end";

type DragState = {
  index: number;
  mode: DragMode;
  pointerStartContentX: number;
  startMs: number;
  endMs: number;
  selectedIndices: number[];
  selectedStarts: number[];
  selectedEnds: number[];
};

type ScrubState = {
  active: boolean;
};
type CaptionsClipboard = {
  segments: CaptionSegment[];
};
type DraftHistory = {
  past: CaptionDocument[];
  future: CaptionDocument[];
};

const MIN_SEGMENT_MS = 120;
const SNAP_MS = 50;
const DEFAULT_NEW_SEGMENT_MS = 1200;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const snapMs = (value: number) => Math.round(value / SNAP_MS) * SNAP_MS;
const toSeconds = (ms: number) => (ms / 1000).toFixed(2);
const getWheelPrimaryDelta = (event: Pick<WheelEvent, "deltaX" | "deltaY">) =>
  Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
const DRAG_EDGE_PX = 56;
const DRAG_MAX_AUTO_SCROLL_STEP = 28;

const AUTOSAVE_DEBOUNCE_MS = 5_000;

const COMPACT_PLAYBACK_TUNING = {
  sampleEveryTicks: 2,
  syncIntervalMs: 90,
  syncMinMoveMs: 120,
  cursorMinDeltaMs: 20,
} as const;

const COMPACT_PLAYBACK_SAMPLE_EVERY_TICKS = clamp(
  COMPACT_PLAYBACK_TUNING.sampleEveryTicks,
  1,
  12
);
const COMPACT_PLAYBACK_SYNC_INTERVAL_MS = clamp(
  COMPACT_PLAYBACK_TUNING.syncIntervalMs,
  16,
  1000
);
const COMPACT_PLAYBACK_SYNC_MIN_MOVE_MS = clamp(
  COMPACT_PLAYBACK_TUNING.syncMinMoveMs,
  0,
  5000
);
const COMPACT_PLAYBACK_CURSOR_MIN_DELTA_MS = clamp(
  COMPACT_PLAYBACK_TUNING.cursorMinDeltaMs,
  1,
  1000
);

const toMs = (seconds: string, fallbackMs: number) => {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackMs;
  return Math.round(parsed * 1000);
};

const hasMeaningfulDraftChange = (current: CaptionDocument, next: CaptionDocument) => {
  return !(
    (next.globalOffsetMs ?? 0) === (current.globalOffsetMs ?? 0) &&
    next.segments.length === current.segments.length &&
    next.segments.every((segment, index) => {
      const prev = current.segments[index];
      return (
        prev &&
        prev.text === segment.text &&
        prev.startMs === segment.startMs &&
        prev.endMs === segment.endMs
      );
    })
  );
};

const buildDefaultDocument = (_mode: string, language: string): CaptionDocument => ({
  backend: "manual",
  language: (language || "en").trim() || "en",
  generatedAt: new Date().toISOString(),
  globalOffsetMs: 0,
  segments: [],
});

const normalizeCaptionDocument = (
  value: CaptionDocument | null | undefined,
  mode: string,
  language: string
): CaptionDocument => {
  const parsed = captionDocumentSchema.safeParse(value ?? buildDefaultDocument(mode, language));
  if (parsed.success) return parsed.data;
  return buildDefaultDocument(mode, language);
};

export function CaptionEditorDrawer({
  open,
  onOpenChange,
  value,
  mode,
  language,
  onSave,
  preview,
  previewModes,
}: CaptionEditorDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col rounded-xl border p-0 sm:max-w-[96vw] lg:max-w-400"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">Captions Editor</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Drag, resize, and edit captions for mode <span className="font-medium">{mode}</span>.
          </p>
        </DialogHeader>
        <CaptionEditor
          value={value}
          mode={mode}
          language={language}
          onSave={onSave}
          preview={preview}
          previewModes={previewModes}
          active={open}
          onRequestClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CaptionEditor({
  value,
  mode,
  language,
  onSave,
  preview,
  previewModes,
  active = true,
  onRequestClose,
  closeHref,
  className,
}: CaptionEditorProps) {
  const isMobile = useIsMobile();
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1024px)");
  const isCompactLayout = isMobile || isTablet;
  const [draft, setDraft] = useState<CaptionDocument>(() =>
    normalizeCaptionDocument(value, mode, language)
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() =>
    (value?.segments?.length ?? 0) > 0 ? 0 : null
  );
  const [selectedIndices, setSelectedIndices] = useState<number[]>(() =>
    (value?.segments?.length ?? 0) > 0 ? [0] : []
  );
  const [cursorMs, setCursorMs] = useState(0);
  const [zoomPxPerSecond, setZoomPxPerSecond] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingSegments, setIsDraggingSegments] = useState(false);
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [volume, setVolume] = useState(1);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [globalOffsetDialogOpen, setGlobalOffsetDialogOpen] = useState(false);
  const [activePreviewMode, setActivePreviewMode] = useState<"full" | "performance">("full");
  const [globalOffsetMsInput, setGlobalOffsetMsInput] = useState(() =>
    String(normalizeCaptionDocument(value, mode, language).globalOffsetMs ?? 0)
  );
  const [history, setHistory] = useState<DraftHistory>({ past: [], future: [] });
  const dragRef = useRef<DragState | null>(null);
  const dragBaselineDraftRef = useRef<CaptionDocument | null>(null);
  const dragSessionDirtyRef = useRef(false);
  const scrubRef = useRef<ScrubState>({ active: false });
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const sortedSegmentsRef = useRef<CaptionSegment[]>([]);
  const durationMsRef = useRef(0);
  const zoomPxPerSecondRef = useRef(90);
  const cursorRafRef = useRef<number | null>(null);
  const cursorPendingMsRef = useRef<number | null>(null);
  const cursorLastCommittedMsRef = useRef(0);
  const playerRef = useRef<PlayerRef>(null);
  const lastPlayerFrameRef = useRef(0);
  const playbackRafRef = useRef<number | null>(null);
  const compactCursorSyncAtRef = useRef(0);
  const clipboardRef = useRef<CaptionsClipboard | null>(null);
  const draftRef = useRef<CaptionDocument>(draft);
  const shiftPressedRef = useRef(false);
  const followScrollTargetRef = useRef<number | null>(null);
  const followScrollRafRef = useRef<number | null>(null);
  const followSuspendUntilRef = useRef(0);
  const mobilePlaybackTickRef = useRef(0);
  const wasOpenRef = useRef(false);
  const baselineDraftRef = useRef<string>("");
  const suppressOffsetInputEffectRef = useRef(false);
  const previewSwitchSnapshotRef = useRef<{ frame: number; wasPlaying: boolean } | null>(null);

  const draftSnapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const isDirty = draftSnapshot !== baselineDraftRef.current;
  const canSave = useMemo(
    () => draft.segments.length > 0 && isDirty,
    [draft.segments.length, isDirty]
  );
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const globalOffsetMs = Math.round(draft.globalOffsetMs ?? 0);
  const toDisplayMs = (ms: number) => Math.max(0, Math.round(ms + globalOffsetMs));
  const toRawMsFromDisplay = (ms: number) => Math.max(0, Math.round(ms - globalOffsetMs));

  const sortedSegments = useMemo(
    () =>
      [...draft.segments]
        .sort((a, b) => a.startMs - b.startMs)
        .map((segment) => ({
          ...segment,
          startMs: toDisplayMs(segment.startMs),
          endMs: Math.max(toDisplayMs(segment.endMs), toDisplayMs(segment.startMs) + 1),
        })),
    [draft.segments, globalOffsetMs]
  );

  const durationMs = useMemo(() => {
    const maxEnd = sortedSegments.reduce((max, segment) => Math.max(max, segment.endMs), 0);
    const previewDurationMs = preview
      ? Math.round((preview.durationInFrames / preview.fps) * 1000)
      : 0;
    // Prefer actual media duration, but never clip existing caption segments.
    return Math.max(previewDurationMs, maxEnd + 2_000, 5_000);
  }, [preview, sortedSegments]);

  const timelineTimeOffsetMs = useMemo(() => {
    const base = (preview?.inputProps ?? {}) as Record<string, unknown>;
    const settings =
      base.settings && typeof base.settings === "object" && !Array.isArray(base.settings)
        ? (base.settings as Record<string, unknown>)
        : {};
    const rawStart = settings.songRangeStartSeconds ?? base.songRangeStartSeconds ?? 0;
    const parsed = Number(rawStart);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 1000);
  }, [preview]);

  const timelineWidth = Math.max(900, Math.round((durationMs / 1000) * zoomPxPerSecond));
  const selectedSegment =
    selectedIndex !== null ? sortedSegments[selectedIndex] ?? null : null;
  const livePreviewInputProps = useMemo(() => {
    if (!preview) return null;
    const base = (preview.inputProps ?? {}) as Record<string, unknown>;
    const settings =
      base.settings && typeof base.settings === "object" && !Array.isArray(base.settings)
        ? (base.settings as Record<string, unknown>)
        : {};
    const shared =
      settings.__shared &&
      typeof settings.__shared === "object" &&
      !Array.isArray(settings.__shared)
        ? (settings.__shared as Record<string, unknown>)
        : {};

    const rangeStartSeconds = Number(settings.songRangeStartSeconds ?? base.songRangeStartSeconds ?? 0);
    const rangeStartMs = Number.isFinite(rangeStartSeconds)
      ? Math.max(0, Math.round(rangeStartSeconds * 1000))
      : 0;

    const previewCaptionsData: CaptionDocument =
      rangeStartMs > 0
        ? {
            ...draft,
            segments: draft.segments.map((segment) => ({
              ...segment,
              startMs: Math.max(0, segment.startMs + rangeStartMs),
              endMs: Math.max(segment.startMs + rangeStartMs + 1, segment.endMs + rangeStartMs),
            })),
          }
        : draft;

    return {
      ...base,
      captionsData: previewCaptionsData,
      settings: {
        ...settings,
        __shared: {
          ...shared,
          captionsData: previewCaptionsData,
        },
      },
    };
  }, [draft, preview]);
  const resolvedPreview = useMemo<CaptionEditorPreviewProps | null>(() => {
    if (!preview || !livePreviewInputProps) return null;

    if (activePreviewMode !== "full") {
      const base = livePreviewInputProps as Record<string, unknown>;
      const safeText = (value: unknown, fallback: string) =>
        typeof value === "string" && value.trim().length > 0 ? value : fallback;
      const safeNumber = (value: unknown, fallback: number) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;

      return {
        ...preview,
        inputProps: {
          ...base,
          audioSrc: safeText(base.audioSrc, ""),
          captionsData:
            base.captionsData ??
            (base.settings && typeof base.settings === "object"
              ? (base.settings as Record<string, unknown>).__shared &&
                typeof (base.settings as Record<string, unknown>).__shared === "object"
                ? ((base.settings as Record<string, unknown>).__shared as Record<string, unknown>)
                    .captionsData
                : null
              : null),
          captionsStyle:
            safeText(base.captionsStyle, "subtitle") === "tiktok" ? "tiktok" : "subtitle",
          captionsAnimationPreset: safeText(base.captionsAnimationPreset, "smooth"),
          captionsWordsPerPage: safeNumber(base.captionsWordsPerPage, 4),
          captionHighlightColor: safeText(base.captionHighlightColor, "#FFD000"),
          previewMode: activePreviewMode,
        },
      };
    }

    return {
      ...preview,
      inputProps: livePreviewInputProps,
    };
  }, [activePreviewMode, livePreviewInputProps, preview]);

  useEffect(() => {
    const snapshot = previewSwitchSnapshotRef.current;
    if (!snapshot || !preview || !active) return;

    let rafId: number | null = null;
    rafId = window.requestAnimationFrame(() => {
      const player = playerRef.current;
      if (!player) return;
      const nextFrame = clamp(snapshot.frame, 0, Math.max(0, preview.durationInFrames - 1));
      lastPlayerFrameRef.current = nextFrame;
      player.seekTo(nextFrame);
      player.setVolume(volume);
      if (snapshot.wasPlaying) {
        player.play();
      }
      previewSwitchSnapshotRef.current = null;
    });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [active, preview, resolvedPreview, volume]);

  useEffect(() => {
    const isOpening = active && !wasOpenRef.current;
    wasOpenRef.current = active;
    if (!active) return;

    // Hydrate from source value when dialog opens (or when value arrives after open
    // and current draft is still empty).
    const shouldHydrate =
      isOpening || (draft.segments.length === 0 && (value?.segments.length ?? 0) > 0);
    if (!shouldHydrate) return;

    const next = normalizeCaptionDocument(value, mode, language);
    setDraft(next);
    setHistory({ past: [], future: [] });
    baselineDraftRef.current = JSON.stringify(next);
    const hasSegments = (next.segments?.length ?? 0) > 0;
    setSelectedIndex(hasSegments ? 0 : null);
    setSelectedIndices(hasSegments ? [0] : []);
    setMobileSelectionMode(false);
    setActivePreviewMode("full");
    setCursorMs(0);
    const initialOffset = next.globalOffsetMs ?? 0;
    suppressOffsetInputEffectRef.current = true;
    setGlobalOffsetMsInput(String(initialOffset));
    setError(null);
  }, [active, draft.segments.length, language, mode, value]);

  const handleRestore = () => {
    if (!baselineDraftRef.current) return;
    const parsed = captionDocumentSchema.safeParse(JSON.parse(baselineDraftRef.current));
    if (!parsed.success) return;
    setDraft(parsed.data);
    setHistory({ past: [], future: [] });
    const hasSegments = parsed.data.segments.length > 0;
    setSelectedIndex(hasSegments ? 0 : null);
    setSelectedIndices(hasSegments ? [0] : []);
    setMobileSelectionMode(false);
    setCursorMs(0);
    const restoredOffset = parsed.data.globalOffsetMs ?? 0;
    suppressOffsetInputEffectRef.current = true;
    setGlobalOffsetMsInput(String(restoredOffset));
    setError(null);
  };

  useEffect(() => {
    if (suppressOffsetInputEffectRef.current) {
      suppressOffsetInputEffectRef.current = false;
      return;
    }
    const nextRequestedOffset = Number.parseInt(globalOffsetMsInput.trim(), 10);
    if (!Number.isFinite(nextRequestedOffset)) return;
    const previousOffset = Math.round(draftRef.current.globalOffsetMs ?? 0);
    let delta = nextRequestedOffset - previousOffset;
    if (delta === 0) return;
    const minStartMs = sortedSegmentsRef.current.reduce(
      (min, segment) => Math.min(min, segment.startMs),
      Number.POSITIVE_INFINITY
    );
    const maxNegativeDelta =
      Number.isFinite(minStartMs) && minStartMs > 0 ? -minStartMs : 0;
    if (delta < maxNegativeDelta) {
      delta = maxNegativeDelta;
    }
    if (delta === 0) return;
    const appliedOffset = previousOffset + delta;
    applyDraftUpdate((current) => ({
      ...current,
      globalOffsetMs: appliedOffset,
      segments: current.segments,
    }));
    // Keep input and effective draft offset aligned when clamping occurs.
    if (nextRequestedOffset !== appliedOffset) {
      suppressOffsetInputEffectRef.current = true;
      setGlobalOffsetMsInput(String(appliedOffset));
    }
  }, [globalOffsetMsInput]);

  useEffect(() => {
    sortedSegmentsRef.current = sortedSegments;
  }, [sortedSegments]);

  useEffect(() => {
    durationMsRef.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    zoomPxPerSecondRef.current = zoomPxPerSecond;
  }, [zoomPxPerSecond]);

  const updateSegment = (
    index: number,
    patch: Partial<{ text: string; startMs: number; endMs: number }>
  ) => {
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const prev = sorted[index];
      if (!prev) return current;
      const nextPatch = { ...patch };
      if (typeof nextPatch.startMs === "number") {
        nextPatch.startMs = toRawMsFromDisplay(nextPatch.startMs);
      }
      if (typeof nextPatch.endMs === "number") {
        nextPatch.endMs = toRawMsFromDisplay(nextPatch.endMs);
      }
      sorted[index] = { ...prev, ...nextPatch };
      return { ...current, segments: sorted };
    });
  };

  const normalizeSelection = (indices: number[], length: number) =>
    Array.from(new Set(indices))
      .filter((idx) => idx >= 0 && idx < length)
      .sort((a, b) => a - b);

  const applyDraftUpdate = (
    updater: (current: CaptionDocument) => CaptionDocument,
    options?: { recordHistory?: boolean }
  ) => {
    const recordHistory = options?.recordHistory ?? true;
    setDraft((current) => {
      const next = updater(current);
      if (next === current) return current;
      if (!hasMeaningfulDraftChange(current, next)) return current;
      if (recordHistory) {
        setHistory((prev) => ({ past: [...prev.past, current], future: [] }));
      } else {
        dragSessionDirtyRef.current = true;
      }
      return next;
    });
  };

  const setSegmentTiming = (
    index: number,
    startMs: number,
    endMs: number,
    recordHistory = true
  ) => {
    applyDraftUpdate((current) => {
      const rawStartMs = toRawMsFromDisplay(startMs);
      const rawEndMs = toRawMsFromDisplay(endMs);
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const target = sorted[index];
      if (!target) return current;
      const prev = index > 0 ? sorted[index - 1] : null;
      const next = index < sorted.length - 1 ? sorted[index + 1] : null;
      const minStart = prev ? prev.endMs : 0;
      const maxEnd = next ? next.startMs : Number.POSITIVE_INFINITY;
      const boundedStart = Math.max(minStart, Math.round(rawStartMs));
      const boundedEnd = Math.min(maxEnd, Math.round(rawEndMs));
      const normalizedStart = Math.max(0, boundedStart);
      const normalizedEnd = Math.max(normalizedStart + MIN_SEGMENT_MS, boundedEnd);
      if (normalizedEnd > maxEnd) {
        // Preserve no-overlap invariant when available gap is tight.
        const safeEnd = Math.max(minStart + MIN_SEGMENT_MS, maxEnd);
        const safeStart = Math.max(minStart, safeEnd - MIN_SEGMENT_MS);
        sorted[index] = {
          ...target,
          startMs: safeStart,
          endMs: safeEnd,
        };
        return { ...current, segments: sorted };
      }
      sorted[index] = {
        ...target,
        startMs: normalizedStart,
        endMs: normalizedEnd,
      };
      return { ...current, segments: sorted };
    }, { recordHistory });
  };

  const addSegment = () => {
    let nextSelected = 0;
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const cursor = clamp(snapMs(toRawMsFromDisplay(cursorMs)), 0, durationMs);
      let insertedStartMs = 0;
      let insertedEndMs = 0;
      const withNew: CaptionSegment[] = [...sorted];
      const containing = sorted.find(
        (segment) => cursor > segment.startMs && cursor < segment.endMs
      );
      const anchor = containing ? containing.endMs : cursor;

      // Find first available gap from the anchor forward without cutting existing segments.
      let windowStart = anchor;
      let windowEnd = durationMs;
      let foundGap = false;
      for (let i = 0; i <= sorted.length; i += 1) {
        const prevEnd = i === 0 ? 0 : sorted[i - 1]!.endMs;
        const nextStart = i === sorted.length ? durationMs : sorted[i]!.startMs;
        if (nextStart - prevEnd < MIN_SEGMENT_MS) continue;
        if (nextStart <= anchor) continue;
        windowStart = prevEnd;
        windowEnd = nextStart;
        foundGap = true;
        break;
      }

      if (!foundGap) {
        const prev = sorted[sorted.length - 1];
        windowStart = Math.max(anchor, prev ? prev.endMs : 0);
        windowEnd = durationMs;
      }

      const available = Math.max(0, windowEnd - windowStart);
      const newDuration = clamp(
        Math.min(DEFAULT_NEW_SEGMENT_MS, available),
        MIN_SEGMENT_MS,
        Math.max(MIN_SEGMENT_MS, available)
      );
      const startMs = clamp(
        snapMs(windowStart),
        windowStart,
        Math.max(windowStart, windowEnd - newDuration)
      );
      const endMs = Math.min(windowEnd, startMs + newDuration);
      const normalizedEnd = Math.max(startMs + MIN_SEGMENT_MS, endMs);
      const next: CaptionSegment = {
        text: "New caption",
        startMs,
        endMs: normalizedEnd,
      };
      insertedStartMs = next.startMs;
      insertedEndMs = next.endMs;
      withNew.push(next);

      const normalized = withNew
        .filter((segment) => segment.endMs - segment.startMs >= MIN_SEGMENT_MS)
        .sort((a, b) => a.startMs - b.startMs);
      nextSelected = normalized.findIndex(
        (segment) =>
          segment.text === "New caption" &&
          segment.startMs === insertedStartMs &&
          segment.endMs === insertedEndMs
      );
      return { ...current, segments: normalized };
    });
    const resolved = nextSelected >= 0 ? nextSelected : 0;
    setSelectedIndex(resolved);
    setSelectedIndices([resolved]);
  };

  const removeSegment = (index: number) => {
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      return {
        ...current,
        segments: sorted.filter((_, segmentIndex) => segmentIndex !== index),
      };
    });
    setSelectedIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
    setSelectedIndices((current) =>
      normalizeSelection(
        current
          .filter((idx) => idx !== index)
          .map((idx) => (idx > index ? idx - 1 : idx)),
        Math.max(0, sortedSegmentsRef.current.length - 1)
      )
    );
  };

  const removeSelectedSegments = () => {
    if (selectedIndices.length === 0) return;
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const toRemove = new Set(selectedIndices);
      return {
        ...current,
        segments: sorted.filter((_, index) => !toRemove.has(index)),
      };
    });
    setSelectedIndex(null);
    setSelectedIndices([]);
  };

  const copySelectedSegments = () => {
    if (selectedIndices.length === 0) return;
    const selected = selectedIndices
      .map((idx) => sortedSegments[idx])
      .filter(Boolean)
      .map((segment) => ({ ...segment }));
    if (selected.length === 0) return;
    clipboardRef.current = { segments: selected };
  };

  const pasteSegmentsAtCursor = () => {
    const payload = clipboardRef.current;
    if (!payload || payload.segments.length === 0) return;
    const source = [...payload.segments]
      .sort((a, b) => a.startMs - b.startMs)
      .map((segment) => ({
        ...segment,
        startMs: toRawMsFromDisplay(segment.startMs),
        endMs: toRawMsFromDisplay(segment.endMs),
      }));
    const sourceStart = source[0]?.startMs ?? 0;
    let nextSelection: number[] = [];
    applyDraftUpdate((current) => {
      const existing = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const placed: CaptionSegment[] = [];
      for (const original of source) {
        const relativeOffset = original.startMs - sourceStart;
        const duration = Math.max(MIN_SEGMENT_MS, original.endMs - original.startMs);
        let candidateStart = Math.max(
          0,
          snapMs(toRawMsFromDisplay(cursorMs) + relativeOffset)
        );
        let searching = true;
        let guard = 0;
        while (searching) {
          guard += 1;
          if (guard > 5000) {
            searching = false;
            break;
          }
          const collision = [...existing, ...placed].find(
            (segment) =>
              candidateStart < segment.endMs && candidateStart + duration > segment.startMs
          );
          if (!collision) {
            searching = false;
            break;
          }
          // Force strict forward progress even when snapping would round backward.
          const nextProbe = Math.max(candidateStart + SNAP_MS, collision.endMs + SNAP_MS);
          candidateStart = snapMs(nextProbe);
        }
        placed.push({
          ...original,
          startMs: candidateStart,
          endMs: candidateStart + duration,
        });
      }
      const merged = [...existing, ...placed].sort((a, b) => a.startMs - b.startMs);
      nextSelection = merged
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) =>
          placed.some(
            (added) =>
              added.startMs === segment.startMs &&
              added.endMs === segment.endMs &&
              added.text === segment.text
          )
        )
        .map(({ index }) => index);
      return { ...current, segments: merged };
    });
    if (nextSelection.length > 0) {
      setSelectedIndices(nextSelection);
      setSelectedIndex(nextSelection[0] ?? null);
    }
  };

  const undo = () => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past[currentHistory.past.length - 1];
      if (!previous) return currentHistory;
      setDraft(previous);
      const offset = Math.round(previous.globalOffsetMs ?? 0);
      suppressOffsetInputEffectRef.current = true;
      setGlobalOffsetMsInput(String(offset));
      const hasSegments = previous.segments.length > 0;
      setSelectedIndex(hasSegments ? 0 : null);
      setSelectedIndices(hasSegments ? [0] : []);
      return {
        past: currentHistory.past.slice(0, -1),
        future: [draftRef.current, ...currentHistory.future],
      };
    });
  };

  const redo = () => {
    setHistory((currentHistory) => {
      const [next, ...futureRest] = currentHistory.future;
      if (!next) return currentHistory;
      setDraft(next);
      const offset = Math.round(next.globalOffsetMs ?? 0);
      suppressOffsetInputEffectRef.current = true;
      setGlobalOffsetMsInput(String(offset));
      const hasSegments = next.segments.length > 0;
      setSelectedIndex(hasSegments ? 0 : null);
      setSelectedIndices(hasSegments ? [0] : []);
      return {
        past: [...currentHistory.past, draftRef.current],
        future: futureRest,
      };
    });
  };

  const handleSegmentSelect = (
    index: number,
    event?: Pick<MouseEvent | React.MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">
  ) => {
    if (isCompactLayout && mobileSelectionMode) {
      setSelectedIndices((current) => {
        const exists = current.includes(index);
        const next = exists ? current.filter((idx) => idx !== index) : [...current, index];
        const normalized = normalizeSelection(next, sortedSegments.length);
        setSelectedIndex(normalized[normalized.length - 1] ?? null);
        return normalized;
      });
      return;
    }
    const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
    const isRange = Boolean(event?.shiftKey);
    if (isRange && selectedIndex !== null) {
      const min = Math.min(selectedIndex, index);
      const max = Math.max(selectedIndex, index);
      const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      setSelectedIndices(range);
      setSelectedIndex(index);
      return;
    }
    if (isToggle) {
      setSelectedIndices((current) => {
        const exists = current.includes(index);
        const next = exists ? current.filter((idx) => idx !== index) : [...current, index];
        const normalized = normalizeSelection(next, sortedSegments.length);
        setSelectedIndex(normalized[normalized.length - 1] ?? null);
        return normalized;
      });
      return;
    }
    setSelectedIndices([index]);
    setSelectedIndex(index);
  };

  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
    mode: DragMode
  ) => {
    if (isCompactLayout && mobileSelectionMode) {
      if (mode !== "move") return;
      if (!selectedIndices.includes(index)) return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = sortedSegments[index];
    if (!target) return;
    const scroller = timelineScrollerRef.current;
    const rect = scroller?.getBoundingClientRect();
    const pointerStartContentX =
      scroller && rect
        ? scroller.scrollLeft + clamp(event.clientX - rect.left, 0, rect.width)
        : event.clientX;
    const selectedForDrag =
      mode === "move" && selectedIndices.includes(index) && selectedIndices.length > 1
        ? [...selectedIndices].sort((a, b) => a - b)
        : [index];
    dragRef.current = {
      index,
      mode,
      pointerStartContentX,
      startMs: target.startMs,
      endMs: target.endMs,
      selectedIndices: selectedForDrag,
      selectedStarts: selectedForDrag.map(
        (selectedIndex) => sortedSegments[selectedIndex]?.startMs ?? target.startMs
      ),
      selectedEnds: selectedForDrag.map(
        (selectedIndex) => sortedSegments[selectedIndex]?.endMs ?? target.endMs
      ),
    };
    dragBaselineDraftRef.current = draftRef.current;
    dragSessionDirtyRef.current = false;
    setIsDraggingSegments(true);
    setSelectedIndex(index);
    setSelectedIndices(selectedForDrag);
    setCursorMs(target.startMs);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const liveSegments = sortedSegmentsRef.current;
      const liveDuration = durationMsRef.current;
      const liveZoom = zoomPxPerSecondRef.current;
      const scroller = timelineScrollerRef.current;
      const rect = scroller?.getBoundingClientRect();
      if (scroller && rect) {
        const localX = event.clientX - rect.left;
        if (localX < DRAG_EDGE_PX) {
          const factor = clamp((DRAG_EDGE_PX - localX) / DRAG_EDGE_PX, 0, 1);
          scroller.scrollLeft = Math.max(
            0,
            scroller.scrollLeft - DRAG_MAX_AUTO_SCROLL_STEP * factor
          );
        } else if (localX > rect.width - DRAG_EDGE_PX) {
          const factor = clamp(
            (localX - (rect.width - DRAG_EDGE_PX)) / DRAG_EDGE_PX,
            0,
            1
          );
          scroller.scrollLeft += DRAG_MAX_AUTO_SCROLL_STEP * factor;
        }
      }
      const currentContentX =
        scroller && rect
          ? scroller.scrollLeft + clamp(event.clientX - rect.left, 0, rect.width)
          : event.clientX;
      const deltaPx = currentContentX - drag.pointerStartContentX;
      const deltaMs = snapMs((deltaPx / liveZoom) * 1000);
      const prev = drag.index > 0 ? liveSegments[drag.index - 1] : null;
      const next = drag.index < liveSegments.length - 1 ? liveSegments[drag.index + 1] : null;
      const minStart = prev ? prev.endMs : 0;
      const maxEnd = next ? next.startMs : liveDuration;

      if (drag.mode === "move") {
        if (drag.selectedIndices.length > 1) {
          const selectedSet = new Set(drag.selectedIndices);
          let minDelta = Number.NEGATIVE_INFINITY;
          let maxDelta = Number.POSITIVE_INFINITY;
          for (let i = 0; i < drag.selectedIndices.length; i += 1) {
            const currentIndex = drag.selectedIndices[i]!;
            const baseStart = drag.selectedStarts[i]!;
            const baseEnd = drag.selectedEnds[i]!;
            minDelta = Math.max(minDelta, -baseStart);
            maxDelta = Math.min(maxDelta, liveDuration - baseEnd);
            const leftNeighbor =
              currentIndex > 0 ? liveSegments[currentIndex - 1] : null;
            if (leftNeighbor && !selectedSet.has(currentIndex - 1)) {
              minDelta = Math.max(minDelta, leftNeighbor.endMs - baseStart);
            }
            const rightNeighbor =
              currentIndex < liveSegments.length - 1
                ? liveSegments[currentIndex + 1]
                : null;
            if (rightNeighbor && !selectedSet.has(currentIndex + 1)) {
              maxDelta = Math.min(maxDelta, rightNeighbor.startMs - baseEnd);
            }
          }

          const boundedDelta = clamp(deltaMs, minDelta, maxDelta);
          applyDraftUpdate((current) => {
            const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
            for (let i = 0; i < drag.selectedIndices.length; i += 1) {
              const currentIndex = drag.selectedIndices[i]!;
              const baseStart = drag.selectedStarts[i]!;
              const baseEnd = drag.selectedEnds[i]!;
              const nextStart = Math.max(0, snapMs(baseStart + boundedDelta));
              const duration = Math.max(MIN_SEGMENT_MS, baseEnd - baseStart);
              sorted[currentIndex] = {
                ...sorted[currentIndex]!,
                startMs: toRawMsFromDisplay(nextStart),
                endMs: toRawMsFromDisplay(nextStart + duration),
              };
            }
            return { ...current, segments: sorted };
          }, { recordHistory: false });
          setCursorMs(Math.max(0, drag.startMs + boundedDelta));
          return;
        }

        const segmentDuration = drag.endMs - drag.startMs;
        const nextStart = clamp(
          snapMs(drag.startMs + deltaMs),
          minStart,
          Math.max(minStart, maxEnd - segmentDuration)
        );
        setSegmentTiming(drag.index, nextStart, nextStart + segmentDuration, false);
        setCursorMs(nextStart);
        return;
      }

      if (drag.mode === "start") {
        const nextStart = clamp(
          snapMs(drag.startMs + deltaMs),
          minStart,
          drag.endMs - MIN_SEGMENT_MS
        );
        setSegmentTiming(drag.index, nextStart, drag.endMs, false);
        setCursorMs(nextStart);
        return;
      }

      const nextEnd = clamp(
        snapMs(drag.endMs + deltaMs),
        drag.startMs + MIN_SEGMENT_MS,
        maxEnd
      );
      setSegmentTiming(drag.index, drag.startMs, nextEnd, false);
      setCursorMs(nextEnd);
    };

    const onPointerUp = () => {
      dragRef.current = null;
      setIsDraggingSegments(false);
      if (dragSessionDirtyRef.current && dragBaselineDraftRef.current) {
        const baseline = dragBaselineDraftRef.current;
        setHistory((prev) => ({ past: [...prev.past, baseline], future: [] }));
      }
      dragBaselineDraftRef.current = null;
      dragSessionDirtyRef.current = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useCaptionEditorShortcuts({
    open: active,
    canUndo,
    canRedo,
    selectedCount: selectedIndices.length,
    selectableCount: sortedSegments.length,
    onCopy: copySelectedSegments,
    onPaste: pasteSegmentsAtCursor,
    onSelectAll: () => {
      const all = sortedSegments.map((_, index) => index);
      setSelectedIndices(all);
      setSelectedIndex(all[0] ?? null);
    },
    onDeleteSelected: removeSelectedSegments,
    onUndo: undo,
    onRedo: redo,
    onTogglePlay: () => {
      const player = playerRef.current;
      if (!player) return;
      if (player.isPlaying()) player.pause();
      else player.play();
    },
  });

  useEffect(() => {
    if (!preview || !active) return;
    const tick = () => {
      const currentPlayer = playerRef.current;
      if (!currentPlayer) {
        playbackRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const playing = currentPlayer.isPlaying();
      if (playing) {
        if (isCompactLayout && COMPACT_PLAYBACK_SAMPLE_EVERY_TICKS > 1) {
          mobilePlaybackTickRef.current =
            (mobilePlaybackTickRef.current + 1) % COMPACT_PLAYBACK_SAMPLE_EVERY_TICKS;
          if (mobilePlaybackTickRef.current !== 0) {
            playbackRafRef.current = window.requestAnimationFrame(tick);
            return;
          }
        }
        const frame = currentPlayer.getCurrentFrame();
        if (frame !== lastPlayerFrameRef.current) {
          lastPlayerFrameRef.current = frame;
          const nextMs = (frame / preview.fps) * 1000;
          const rounded = Math.round(nextMs);
          if (isCompactLayout) {
            const now = performance.now();
            const elapsed = now - compactCursorSyncAtRef.current;
            const moved = Math.abs(rounded - cursorLastCommittedMsRef.current);
            if (
              elapsed < COMPACT_PLAYBACK_SYNC_INTERVAL_MS &&
              moved < COMPACT_PLAYBACK_SYNC_MIN_MOVE_MS
            ) {
              playbackRafRef.current = window.requestAnimationFrame(tick);
              return;
            }
            compactCursorSyncAtRef.current = now;
          }
          const minDeltaMs = isCompactLayout
            ? COMPACT_PLAYBACK_CURSOR_MIN_DELTA_MS
            : 1;
          if (Math.abs(rounded - cursorLastCommittedMsRef.current) >= minDeltaMs) {
            cursorLastCommittedMsRef.current = rounded;
            setCursorMs(nextMs);
            followPlaybackCursor(nextMs);
          }
        }
      }
      playbackRafRef.current = window.requestAnimationFrame(tick);
    };
    playbackRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (playbackRafRef.current !== null) {
        window.cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = null;
      }
      compactCursorSyncAtRef.current = 0;
    };
  }, [active, isCompactLayout, preview]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onVolumeChange = ({ detail }: { detail: { volume: number } }) => {
      setVolume(clamp(detail.volume, 0, 1));
    };
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("volumechange", onVolumeChange);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("volumechange", onVolumeChange);
    };
  }, [preview]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !preview) return;
    // While playback is running, let player events drive cursor state.
    // Only seek from cursor during direct timeline interactions.
    const isInteracting = scrubRef.current.active || dragRef.current !== null;
    if (player.isPlaying() && !isInteracting) {
      return;
    }
    const nextFrame = clamp(
      Math.round((cursorMs / 1000) * preview.fps),
      0,
      Math.max(0, preview.durationInFrames - 1)
    );
    const currentFrame = player.getCurrentFrame();
    if (Math.abs(currentFrame - nextFrame) <= 0) return;
    if (nextFrame === lastPlayerFrameRef.current) return;
    lastPlayerFrameRef.current = nextFrame;
    player.seekTo(nextFrame);
  }, [cursorMs, preview]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(volume);
  }, [volume]);

  const tickMarks = useMemo(() => {
    const ticks: number[] = [];
    const seconds = Math.ceil(durationMs / 1000);
    const step = isCompactLayout ? 2 : 1;
    for (let second = 0; second <= seconds; second += step) {
      ticks.push(second * 1000);
    }
    return ticks;
  }, [durationMs, isCompactLayout]);

  const setCursorFromClientX = (clientX: number, followViewport = false) => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    if (durationMs <= 0 || timelineWidth <= 0) return;
    const rect = scroller.getBoundingClientRect();
    const localX = clientX - rect.left;
    if (followViewport) {
      const contentX = clamp(localX + scroller.scrollLeft, 0, timelineWidth);
      // Lower sensitivity: only start auto-pan when pointer is close to edges.
      const leftTrigger = rect.width * 0.18;
      const rightTrigger = rect.width * 0.82;
      if (localX <= leftTrigger || localX >= rightTrigger) {
        const targetLeft = clamp(
          contentX - rect.width * 0.5,
          0,
          Math.max(0, timelineWidth - rect.width)
        );
        // Gentle follow to avoid jumpy feel.
        scroller.scrollLeft += (targetLeft - scroller.scrollLeft) * 0.16;
      }
    } else {
      const edgePadding = 28;
      if (localX < edgePadding) {
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft - (edgePadding - localX));
      } else if (localX > rect.width - edgePadding) {
        scroller.scrollLeft += localX - (rect.width - edgePadding);
      }
    }
    const x = clamp(localX + scroller.scrollLeft, 0, timelineWidth);
    const ms = clamp((x / timelineWidth) * durationMs, 0, durationMs);
    if (!Number.isFinite(ms)) return;
    cursorPendingMsRef.current = ms;
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = window.requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const pending = cursorPendingMsRef.current;
      if (pending === null) return;
      const next = Math.round(pending);
      if (!Number.isFinite(next)) return;
      // Avoid rerender spam for tiny pointer jitter.
      if (Math.abs(next - cursorLastCommittedMsRef.current) < 4) return;
      setCursorMs((prev) => {
        if (Math.abs(next - prev) < 4) return prev;
        cursorLastCommittedMsRef.current = next;
        return next;
      });
    });
  };

  const setZoomAnchored = (nextZoom: number, anchorClientX?: number) => {
    const clampedZoom = clamp(nextZoom, 40, 240);
    const scroller = timelineScrollerRef.current;
    const currentZoom = zoomPxPerSecondRef.current;
    if (!scroller || clampedZoom === currentZoom) {
      setZoomPxPerSecond(clampedZoom);
      return;
    }
    const oldWidth = Math.max(900, Math.round((durationMs / 1000) * currentZoom));
    const newWidth = Math.max(900, Math.round((durationMs / 1000) * clampedZoom));

    const rect = scroller.getBoundingClientRect();
    const viewportAnchorX =
      typeof anchorClientX === "number"
        ? clamp(anchorClientX - rect.left, 0, rect.width)
        : rect.width * 0.5;
    const oldAnchorX = scroller.scrollLeft + viewportAnchorX;
    const ratio = oldWidth > 0 ? oldAnchorX / oldWidth : 0;
    const newAnchorX = ratio * newWidth;
    const nextScrollLeft = clamp(
      newAnchorX - viewportAnchorX,
      0,
      Math.max(0, newWidth - scroller.clientWidth)
    );
    setZoomPxPerSecond(clampedZoom);
    requestAnimationFrame(() => {
      const liveScroller = timelineScrollerRef.current;
      if (!liveScroller) return;
      liveScroller.scrollLeft = nextScrollLeft;
    });
  };

  const followPlaybackCursor = (timeMs: number) => {
    if (Date.now() < followSuspendUntilRef.current) return;
    const scroller = timelineScrollerRef.current;
    if (!scroller || durationMs <= 0) return;
    const currentZoom = zoomPxPerSecondRef.current;
    const contentWidth = Math.max(900, Math.round((durationMs / 1000) * currentZoom));
    const cursorX = (timeMs / durationMs) * contentWidth;
    const viewWidth = scroller.clientWidth;
    const leadEdge = scroller.scrollLeft + viewWidth * 0.78;
    const trailEdge = scroller.scrollLeft + viewWidth * 0.14;
    const pageStep = viewWidth * 0.62;

    if (cursorX > leadEdge) {
      const target = clamp(
        scroller.scrollLeft + pageStep,
        0,
        Math.max(0, contentWidth - viewWidth)
      );
      if (isCompactLayout) {
        scroller.scrollLeft = target;
        return;
      }
      followScrollTargetRef.current = target;
      return;
    }
    if (cursorX < trailEdge) {
      const target = clamp(
        scroller.scrollLeft - pageStep,
        0,
        Math.max(0, contentWidth - viewWidth)
      );
      if (isCompactLayout) {
        scroller.scrollLeft = target;
        return;
      }
      followScrollTargetRef.current = target;
    }
  };

  const suspendAutoFollow = (ms = 650) => {
    followSuspendUntilRef.current = Date.now() + ms;
    followScrollTargetRef.current = null;
  };

  useEffect(() => {
    if (isCompactLayout) return;
    if (!active) return;
    const tick = () => {
      const scroller = timelineScrollerRef.current;
      const target = followScrollTargetRef.current;
      if (scroller && typeof target === "number") {
        const delta = target - scroller.scrollLeft;
        const eased = delta * 0.22;
        const maxStep = 96;
        const step = clamp(eased, -maxStep, maxStep);
        if (Math.abs(delta) < 0.35) {
          scroller.scrollLeft = target;
          followScrollTargetRef.current = null;
        } else {
          scroller.scrollLeft += step;
        }
      }
      followScrollRafRef.current = window.requestAnimationFrame(tick);
    };
    followScrollRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (followScrollRafRef.current !== null) {
        window.cancelAnimationFrame(followScrollRafRef.current);
        followScrollRafRef.current = null;
      }
      followScrollTargetRef.current = null;
    };
  }, [active, isCompactLayout]);

  useEffect(() => {
    return () => {
      if (cursorRafRef.current !== null) {
        window.cancelAnimationFrame(cursorRafRef.current);
      }
      if (playbackRafRef.current !== null) {
        window.cancelAnimationFrame(playbackRafRef.current);
      }
      if (followScrollRafRef.current !== null) {
        window.cancelAnimationFrame(followScrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftPressedRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftPressedRef.current = false;
    };
    const onBlur = () => {
      shiftPressedRef.current = false;
    };
    const onWheelNative = (event: WheelEvent) => {
      const scroller = timelineScrollerRef.current;
      if (!scroller) return;
      const target = event.target as Node | null;
      if (!target || !scroller.contains(target)) return;
      const isShiftZoom =
        shiftPressedRef.current ||
        event.shiftKey ||
        event.getModifierState?.("Shift") === true;
      if (!isShiftZoom) return;
      suspendAutoFollow(800);
      const delta = getWheelPrimaryDelta(event);
      if (delta === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = delta > 0 ? -10 : 10;
      setZoomAnchored(zoomPxPerSecondRef.current + direction, event.clientX);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("wheel", onWheelNative, {
      passive: false,
      capture: true,
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("wheel", onWheelNative, true);
    };
  }, [active]);

  const buildNormalizedDraft = (source: CaptionDocument): CaptionDocument => ({
    ...source,
    generatedAt: new Date().toISOString(),
    globalOffsetMs: Math.round(source.globalOffsetMs ?? 0),
    segments: [...source.segments]
      .map((segment) => {
        const startMs = Math.max(0, Math.round(segment.startMs));
        const endMs = Math.max(startMs + 1, Math.round(segment.endMs));
        return { ...segment, startMs, endMs, text: segment.text.trim() };
      })
      .filter((segment) => segment.text.length > 0)
      .sort((a, b) => a.startMs - b.startMs),
  });

  const persistDraft = async (
    source: CaptionDocument,
    options?: {
      closeAfterSave?: boolean;
      toastMode?: "none" | "autosave";
      resetHistory?: boolean;
    }
  ) => {
    const parsed = captionDocumentSchema.safeParse(buildNormalizedDraft(source));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid captions data.");
      return false;
    }

    setIsSaving(true);
    const savePromise = Promise.resolve(
      onSave(parsed.data, {
        source: options?.toastMode === "autosave" ? "autosave" : "manual",
      })
    );

    try {
      if (options?.toastMode === "autosave") {
        await toast.promise(savePromise, {
          loading: "Autosaving captions...",
          success: "Captions autosaved.",
          error: (err) =>
            err instanceof Error ? err.message : "Failed to autosave captions.",
        });
      } else {
        await savePromise;
      }
      setDraft(parsed.data);
      baselineDraftRef.current = JSON.stringify(parsed.data);
      if (options?.resetHistory ?? true) {
        setHistory({ past: [], future: [] });
      }
      setError(null);
      if (options?.closeAfterSave) {
        onRequestClose?.();
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save captions."
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    if (isSaving) return;
    if (!isDirty) return;
    if (history.past.length === 0) return;

    const timeout = window.setTimeout(() => {
      void persistDraft(draftRef.current, {
        toastMode: "autosave",
        resetHistory: false,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active, history.past.length, isDirty, isSaving]);

  const handleSave = async () => {
    if (isSaving) return;
    await persistDraft(draftRef.current, {
      closeAfterSave: true,
      toastMode: "none",
      resetHistory: true,
    });
  };

  return (
    <div
      className={cn(
        "flex h-full w-full max-w-full flex-col rounded-xl",
        className
      )}
    >
        <div className="px-2 pb-8 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
          {closeHref ? (
            <Button
              asChild
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close captions editor"
            >
              <Link href={closeHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : onRequestClose ? (
            <Button
              type="button"
              variant="ghost"
                size="icon-sm"
                aria-label="Close captions editor"
                onClick={onRequestClose}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Captions Editor</h2>
              <p className="text-sm text-slate-500 dark:text-zinc-400 hidden lg:block">
                preview your captions in real-time as you edit.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <div className="hidden items-center gap-1 lg:flex">
              <Tooltip disableMobileDrawer delayDuration={100}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={"ghost"}
                    className="inline-flex h-8 w-8 text-muted-foreground rounded-full transition-colors"
                    aria-label="About global offset"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Shift all caption timings by this amount in milliseconds.
                </TooltipContent>
              </Tooltip>
              <Input
                value={globalOffsetMsInput}
                onChange={(event) => setGlobalOffsetMsInput(event.target.value)}
                className="h-9 w-28 text-right"
                inputMode="numeric"
                aria-label="Global captions offset in milliseconds"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRestore}
              disabled={!isDirty || isSaving}
            >
              <RotateCw className="size-5" />
              <span className="hidden sm:inline">Restore</span>
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave} loading={isSaving}>
              <Save className="size-5" />
              <span className="hidden sm:inline">Save Caption</span>
            </Button>
          </div>
      </div>

        <div className="flex min-h-0 flex-1 flex-col">

          <CaptionEditorPreview
            preview={resolvedPreview}
            playerRef={playerRef}
          />
          <CaptionEditorToolbar
            isMobileSelectionMode={mobileSelectionMode}
            selectedCount={selectedIndices.length}
            canEditSelected={selectedIndices.length === 1 && !mobileSelectionMode}
            isPlaying={isPlaying}
            volume={volume}
            canCopy={selectedIndices.length > 0}
            canPaste={Boolean(clipboardRef.current)}
            canDelete={selectedIndices.length > 0}
            canUndo={canUndo}
            canRedo={canRedo}
            segmentCount={sortedSegments.length}
            onTogglePlay={() => {
              const player = playerRef.current;
              if (!player) return;
              if (player.isPlaying()) player.pause();
              else player.play();
            }}
            onVolumeChange={(value) => setVolume(clamp(value, 0, 1))}
            onAddSegment={addSegment}
            onCopy={copySelectedSegments}
            onPaste={pasteSegmentsAtCursor}
            onDelete={removeSelectedSegments}
            onUndo={undo}
            onRedo={redo}
            onZoomOut={() => setZoomAnchored(zoomPxPerSecond - 10)}
            onZoomIn={() => setZoomAnchored(zoomPxPerSecond + 10)}
            onEditSelected={() => setMobileInspectorOpen(true)}
            onOpenGlobalOffsetEditor={() => setGlobalOffsetDialogOpen(true)}
            onToggleMobileSelectionMode={() =>
              setMobileSelectionMode((current) => {
                const next = !current;
                if (!next) {
                  setSelectedIndices([]);
                  setSelectedIndex(null);
                }
                return next;
              })
            }
            previewModes={previewModes}
            activePreviewMode={activePreviewMode}
            onSelectPreviewMode={(mode) => {
              const player = playerRef.current;
              previewSwitchSnapshotRef.current = player
                ? {
                    frame: player.getCurrentFrame(),
                    wasPlaying: player.isPlaying(),
                  }
                : null;
              setActivePreviewMode(mode);
            }}
          />

          <div className="flex mt-2 min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
            <CaptionEditorTimeline
              isMobile={isCompactLayout}
              isSelectionMode={mobileSelectionMode}
              isPlaying={isPlaying}
              isDraggingSegments={isDraggingSegments}
              canUndo={canUndo}
              canRedo={canRedo}
              canCopy={selectedIndices.length > 0}
              canPaste={Boolean(clipboardRef.current)}
              canDelete={selectedIndices.length > 0}
              timelineScrollerRef={timelineScrollerRef}
              timelineWidth={timelineWidth}
              durationMs={durationMs}
              cursorMs={cursorMs}
              tickMarks={tickMarks}
              sortedSegments={sortedSegments}
              selectedIndices={selectedIndices}
              toSeconds={toSeconds}
              timeOffsetMs={timelineTimeOffsetMs}
              suspendAutoFollow={suspendAutoFollow}
              onSetCursorFromClientX={setCursorFromClientX}
              onStartDrag={startDrag}
              onSelectSegment={(index, event) => {
                suspendAutoFollow(900);
                handleSegmentSelect(index, event);
                setCursorMs(sortedSegments[index]?.startMs ?? cursorMs);
              }}
              onWheelDelta={(delta) => {
                const el = timelineScrollerRef.current;
                if (!el) return;
                el.scrollLeft += delta;
              }}
              getWheelPrimaryDelta={getWheelPrimaryDelta}
              onTogglePlay={() => {
                const player = playerRef.current;
                if (!player) return;
                if (player.isPlaying()) player.pause();
                else player.play();
              }}
              onAddSegment={addSegment}
              onCopy={copySelectedSegments}
              onPaste={pasteSegmentsAtCursor}
              onDelete={removeSelectedSegments}
              onUndo={undo}
              onRedo={redo}
              onZoomOut={() => setZoomAnchored(zoomPxPerSecond - 10)}
              onZoomIn={() => setZoomAnchored(zoomPxPerSecond + 10)}
              onBeginNavigate={() => {
                const player = playerRef.current;
                if (!player) return;
                if (player.isPlaying()) player.pause();
              }}
              onOpenInspectorForSegment={(index) => {
                setSelectedIndices([index]);
                setSelectedIndex(index);
                setMobileInspectorOpen(true);
              }}
            />

            {!isCompactLayout ? (
              <div className="min-h-0 w-full rounded-lg border bg-background p-3 lg:w-75 lg:shrink-0">
                <CaptionEditorInspector
                  sortedSegmentsLength={sortedSegments.length}
                  selectedIndices={selectedIndices}
                  selectedIndex={selectedIndex}
                  selectedSegment={selectedSegment}
                  onRemoveSelected={removeSelectedSegments}
                  onRemoveSingle={removeSegment}
                  toSeconds={toSeconds}
                  toMs={toMs}
                  setSegmentTiming={setSegmentTiming}
                  updateSegmentText={(index, text) => updateSegment(index, { text })}
                />
              </div>
            ) : null}
          </div>


        </div>
          <Dialog open={globalOffsetDialogOpen} onOpenChange={setGlobalOffsetDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Global Offset (ms)</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Shift all caption timings by the amount below in milliseconds.
                </p>
                <Input
                  value={globalOffsetMsInput}
                  onChange={(event) => setGlobalOffsetMsInput(event.target.value)}
                  className="h-10 text-right"
                  inputMode="numeric"
                  aria-label="Global captions offset in milliseconds"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setGlobalOffsetDialogOpen(false)}
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

        {isCompactLayout ? (
          <Drawer open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Caption Inspector</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <CaptionEditorInspector
                  sortedSegmentsLength={sortedSegments.length}
                  selectedIndices={selectedIndices}
                  selectedIndex={selectedIndex}
                  selectedSegment={selectedSegment}
                  onRemoveSelected={removeSelectedSegments}
                  onRemoveSingle={removeSegment}
                  toSeconds={toSeconds}
                  toMs={toMs}
                  setSegmentTiming={setSegmentTiming}
                  updateSegmentText={(index, text) => updateSegment(index, { text })}
                />
              </div>
            </DrawerContent>
          </Drawer>
        ) : null}
    </div>
  );
}
