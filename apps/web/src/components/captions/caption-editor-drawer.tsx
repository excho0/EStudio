"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
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
import { cn } from "@/lib/shared/utils";
import { useIsMobile } from "@/hooks/use-mobile";
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

type CaptionEditorDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CaptionDocument | null;
  mode: string;
  language: string;
  onSave: (next: CaptionDocument) => Promise<void> | void;
  preview: CaptionEditorPreviewProps | null;
};

type DragMode = "move" | "start" | "end";

type DragState = {
  index: number;
  mode: DragMode;
  pointerStartX: number;
  startMs: number;
  endMs: number;
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

const toMs = (seconds: string, fallbackMs: number) => {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackMs;
  return Math.round(parsed * 1000);
};

const buildDefaultDocument = (_mode: string, language: string): CaptionDocument => ({
  backend: "manual",
  language: (language || "en").trim() || "en",
  generatedAt: new Date().toISOString(),
  segments: [],
});

export function CaptionEditorDrawer({
  open,
  onOpenChange,
  value,
  mode,
  language,
  onSave,
  preview,
}: CaptionEditorDrawerProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<CaptionDocument>(() =>
    value ?? buildDefaultDocument(mode, language)
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
  const [volume, setVolume] = useState(1);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [history, setHistory] = useState<DraftHistory>({ past: [], future: [] });
  const dragRef = useRef<DragState | null>(null);
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
  const clipboardRef = useRef<CaptionsClipboard | null>(null);
  const draftRef = useRef<CaptionDocument>(draft);
  const shiftPressedRef = useRef(false);
  const followScrollTargetRef = useRef<number | null>(null);
  const followScrollRafRef = useRef<number | null>(null);
  const followSuspendUntilRef = useRef(0);
  const mobilePlaybackTickRef = useRef(0);
  const wasOpenRef = useRef(false);
  const baselineDraftRef = useRef<string>("");

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

  const sortedSegments = useMemo(
    () => [...draft.segments].sort((a, b) => a.startMs - b.startMs),
    [draft.segments]
  );

  const durationMs = useMemo(() => {
    const maxEnd = sortedSegments.reduce((max, segment) => Math.max(max, segment.endMs), 0);
    const previewDurationMs = preview
      ? Math.round((preview.durationInFrames / preview.fps) * 1000)
      : 0;
    // Prefer actual media duration, but never clip existing caption segments.
    return Math.max(previewDurationMs, maxEnd + 2_000, 5_000);
  }, [preview, sortedSegments]);

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
    return {
      ...base,
      captionsData: draft,
      settings: {
        ...settings,
        __shared: {
          ...shared,
          captionsData: draft,
        },
      },
    };
  }, [draft, preview]);

  useEffect(() => {
    const isOpening = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) return;

    // Hydrate from source value when dialog opens (or when value arrives after open
    // and current draft is still empty).
    const shouldHydrate =
      isOpening || (draft.segments.length === 0 && (value?.segments.length ?? 0) > 0);
    if (!shouldHydrate) return;

    const next = value ?? buildDefaultDocument(mode, language);
    setDraft(next);
    setHistory({ past: [], future: [] });
    baselineDraftRef.current = JSON.stringify(next);
    const hasSegments = (next.segments?.length ?? 0) > 0;
    setSelectedIndex(hasSegments ? 0 : null);
    setSelectedIndices(hasSegments ? [0] : []);
    setCursorMs(0);
    setError(null);
  }, [draft.segments.length, language, mode, open, value]);

  const handleRestore = () => {
    if (!baselineDraftRef.current) return;
    const parsed = captionDocumentSchema.safeParse(JSON.parse(baselineDraftRef.current));
    if (!parsed.success) return;
    setDraft(parsed.data);
    setHistory({ past: [], future: [] });
    const hasSegments = parsed.data.segments.length > 0;
    setSelectedIndex(hasSegments ? 0 : null);
    setSelectedIndices(hasSegments ? [0] : []);
    setCursorMs(0);
    setError(null);
  };

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
      sorted[index] = { ...prev, ...patch };
      return { ...current, segments: sorted };
    });
  };

  const normalizeSelection = (indices: number[], length: number) =>
    Array.from(new Set(indices))
      .filter((idx) => idx >= 0 && idx < length)
      .sort((a, b) => a - b);

  const applyDraftUpdate = (updater: (current: CaptionDocument) => CaptionDocument) => {
    setDraft((current) => {
      const next = updater(current);
      if (next === current) return current;
      const same =
        next.segments.length === current.segments.length &&
        next.segments.every((segment, index) => {
          const prev = current.segments[index];
          return (
            prev &&
            prev.text === segment.text &&
            prev.startMs === segment.startMs &&
            prev.endMs === segment.endMs
          );
        });
      if (same) return current;
      setHistory((prev) => ({ past: [...prev.past, current], future: [] }));
      return next;
    });
  };

  const setSegmentTiming = (index: number, startMs: number, endMs: number) => {
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const target = sorted[index];
      if (!target) return current;
      const prev = index > 0 ? sorted[index - 1] : null;
      const next = index < sorted.length - 1 ? sorted[index + 1] : null;
      const minStart = prev ? prev.endMs : 0;
      const maxEnd = next ? next.startMs : Number.POSITIVE_INFINITY;
      const boundedStart = Math.max(minStart, Math.round(startMs));
      const boundedEnd = Math.min(maxEnd, Math.round(endMs));
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
    });
  };

  const addSegment = () => {
    let nextSelected = 0;
    applyDraftUpdate((current) => {
      const sorted = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const cursor = clamp(snapMs(cursorMs), 0, durationMs);
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
    const source = [...payload.segments].sort((a, b) => a.startMs - b.startMs);
    const sourceStart = source[0]?.startMs ?? 0;
    let nextSelection: number[] = [];
    applyDraftUpdate((current) => {
      const existing = [...current.segments].sort((a, b) => a.startMs - b.startMs);
      const placed: CaptionSegment[] = [];
      for (const original of source) {
        const relativeOffset = original.startMs - sourceStart;
        const duration = Math.max(MIN_SEGMENT_MS, original.endMs - original.startMs);
        let candidateStart = Math.max(0, snapMs(cursorMs + relativeOffset));
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
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = sortedSegments[index];
    if (!target) return;
    dragRef.current = {
      index,
      mode,
      pointerStartX: event.clientX,
      startMs: target.startMs,
      endMs: target.endMs,
    };
    setSelectedIndex(index);
    setSelectedIndices([index]);
    setCursorMs(target.startMs);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const liveSegments = sortedSegmentsRef.current;
      const liveDuration = durationMsRef.current;
      const liveZoom = zoomPxPerSecondRef.current;
      const deltaPx = event.clientX - drag.pointerStartX;
      const deltaMs = snapMs((deltaPx / liveZoom) * 1000);
      const prev = drag.index > 0 ? liveSegments[drag.index - 1] : null;
      const next = drag.index < liveSegments.length - 1 ? liveSegments[drag.index + 1] : null;
      const minStart = prev ? prev.endMs : 0;
      const maxEnd = next ? next.startMs : liveDuration;

      if (drag.mode === "move") {
        const segmentDuration = drag.endMs - drag.startMs;
        const nextStart = clamp(
          snapMs(drag.startMs + deltaMs),
          minStart,
          Math.max(minStart, maxEnd - segmentDuration)
        );
        setSegmentTiming(drag.index, nextStart, nextStart + segmentDuration);
        setCursorMs(nextStart);
        return;
      }

      if (drag.mode === "start") {
        const nextStart = clamp(
          snapMs(drag.startMs + deltaMs),
          minStart,
          drag.endMs - MIN_SEGMENT_MS
        );
        setSegmentTiming(drag.index, nextStart, drag.endMs);
        setCursorMs(nextStart);
        return;
      }

      const nextEnd = clamp(
        snapMs(drag.endMs + deltaMs),
        drag.startMs + MIN_SEGMENT_MS,
        maxEnd
      );
      setSegmentTiming(drag.index, drag.startMs, nextEnd);
      setCursorMs(nextEnd);
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useCaptionEditorShortcuts({
    open,
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
    if (!preview || !open) return;
    const tick = () => {
      const currentPlayer = playerRef.current;
      if (!currentPlayer) {
        playbackRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const playing = currentPlayer.isPlaying();
      setIsPlaying((prev) => (prev === playing ? prev : playing));
      if (playing) {
        if (isMobile) {
          mobilePlaybackTickRef.current = (mobilePlaybackTickRef.current + 1) % 2;
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
          if (Math.abs(rounded - cursorLastCommittedMsRef.current) >= 1) {
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
    };
  }, [isMobile, open, preview]);

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
    const step = isMobile ? 2 : 1;
    for (let second = 0; second <= seconds; second += step) {
      ticks.push(second * 1000);
    }
    return ticks;
  }, [durationMs, isMobile]);

  const setCursorFromClientX = (clientX: number, followViewport = false) => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
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
    cursorPendingMsRef.current = ms;
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = window.requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const pending = cursorPendingMsRef.current;
      if (pending === null) return;
      const next = Math.round(pending);
      // Avoid rerender spam for tiny pointer jitter.
      if (Math.abs(next - cursorLastCommittedMsRef.current) < 4) return;
      cursorLastCommittedMsRef.current = next;
      setCursorMs(next);
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
      if (isMobile) {
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
      if (isMobile) {
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
    if (isMobile) return;
    if (!open) return;
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
  }, [isMobile, open]);

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
    if (!open) return;
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
  }, [open]);

  const handleSave = async () => {
    if (isSaving) return;
    const normalized = {
      ...draft,
      generatedAt: new Date().toISOString(),
      segments: [...draft.segments]
        .map((segment) => {
          const startMs = Math.max(0, Math.round(segment.startMs));
          const endMs = Math.max(startMs + 1, Math.round(segment.endMs));
          return { ...segment, startMs, endMs, text: segment.text.trim() };
        })
        .filter((segment) => segment.text.length > 0)
        .sort((a, b) => a.startMs - b.startMs),
    };

    const parsed = captionDocumentSchema.safeParse(normalized);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid captions data.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(parsed.data);
      baselineDraftRef.current = JSON.stringify(parsed.data);
      setHistory({ past: [], future: [] });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save captions."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col rounded-xl border p-0 sm:max-w-[96vw] lg:max-w-[1600px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">Captions Editor</DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close captions editor"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
          <p className="text-sm text-muted-foreground">
            Drag, resize, and edit captions for mode <span className="font-medium">{mode}</span>.
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">

          <CaptionEditorPreview
            preview={
              preview && livePreviewInputProps
                ? {
                    ...preview,
                    inputProps: livePreviewInputProps,
                  }
                : null
            }
            playerRef={playerRef}
          />
          <CaptionEditorToolbar
            canEditSelected={selectedIndices.length > 0}
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
          />

          <div className="flex mt-2 min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
            <CaptionEditorTimeline
              isMobile={isMobile}
              isPlaying={isPlaying}
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
            />

            {!isMobile ? (
              <div className="min-h-0 w-full rounded-lg border bg-background p-3 lg:w-[420px] lg:shrink-0">
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

          <div className="mt-3 flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRestore}
                disabled={!isDirty || isSaving}
              >
                Restore
              </Button>
              <Button type="button" onClick={handleSave} disabled={!canSave} loading={isSaving}>
                Save captions
              </Button>
            </div>
          </div>
        </div>
        {isMobile ? (
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
      </DialogContent>
    </Dialog>
  );
}
