import { buildCaptionBlocksFromWords, type CaptionBlock, type CaptionWord } from "../../types/captions";
import { hashString, clamp, lerp } from "@estudio/utils";

export type CaptionToken = {
  text: string;
  fromMs: number;
  toMs: number;
};

export type CaptionPage = {
  text: string;
  startMs: number;
  durationMs: number;
  tokens: CaptionToken[];
};

type RuntimeCaptionBlock = CaptionBlock & {
  words: CaptionWord[];
};

const PAGE_SPLIT_GAP_MS = 5000;
const easeOutSine01 = (value: number) => Math.sin((value * Math.PI) / 2);
const easeInOutSineWide01 = (value: number) => 0.5 - 0.5 * Math.cos(value * Math.PI);

export type CaptionAnimationPreset =
  | "smooth"
  | "cinematic"
  | "punch"
  | "minimal"
  | "cascade";
export type CaptionStyle = "subtitle" | "tiktok";

type CaptionMotionPreset = {
  fromY: number;
  fromX: number;
  fromScale: number;
  fromRotate: number;
  blurFrom: number;
  pulseAmount: number;
  depthFrom: number;
};

export const buildCaptionPages = (
  captionBlocks: RuntimeCaptionBlock[],
  wordsPerPage: number
) => {
  const tokens: Array<CaptionToken & { segmentIndex: number }> = [];

  for (let segmentIndex = 0; segmentIndex < captionBlocks.length; segmentIndex += 1) {
    const captionBlock = captionBlocks[segmentIndex];
    const runtimeWords = captionBlock.words;
    if (runtimeWords.length === 0) continue;
    for (let i = 0; i < runtimeWords.length; i += 1) {
      const word = runtimeWords[i]!;
      const fromMs = Math.max(0, Math.round(word.startMs));
      const toMs = Math.max(fromMs + 1, Math.round(word.endMs));
      tokens.push({
        text: word.text,
        fromMs,
        toMs,
        segmentIndex,
      });
    }
  }

  const pages: CaptionPage[] = [];
  let cursor = 0;
  while (cursor < tokens.length) {
    const current = tokens[cursor];
    if (!current) break;
    const slice: CaptionToken[] = [current];
    cursor += 1;

    while (cursor < tokens.length && slice.length < wordsPerPage) {
      const next = tokens[cursor];
      const prev = tokens[cursor - 1];
      if (!next || !prev) break;
      const crossedSegment = next.segmentIndex !== prev.segmentIndex;
      const crossedLongGap =
        crossedSegment && next.fromMs - prev.toMs >= PAGE_SPLIT_GAP_MS;
      if (crossedLongGap) {
        break;
      }
      slice.push(next);
      cursor += 1;
    }

    const startMs = slice[0].fromMs;
    const durationMs = Math.max(1, slice[slice.length - 1].toMs - startMs);
    pages.push({
      text: slice.map((token) => token.text).join(" "),
      startMs,
      durationMs,
      tokens: slice,
    });
  }

  return pages;
};

export const getWordsPerPage = (preset: CaptionAnimationPreset) => {
  if (preset === "punch" || preset === "cascade") return 3;
  return 4;
};

const getCaptionEnterExitMs = (
  preset: CaptionAnimationPreset,
  style: CaptionStyle
) => {
  const enterMs =
    preset === "minimal"
      ? 90
      : preset === "cascade"
        ? 180
      : preset === "punch"
        ? 120
        : preset === "cinematic"
          ? 240
          : style === "tiktok"
            ? 180
            : 140;

  const exitMs =
    preset === "minimal"
      ? 80
      : preset === "cascade"
        ? 140
      : preset === "punch"
        ? 100
        : preset === "cinematic"
          ? 200
          : style === "tiktok"
            ? 140
            : 120;

  return { enterMs, exitMs };
};

const getAdaptiveCaptionTimings = ({
  preset,
  style,
}: {
  preset: CaptionAnimationPreset;
  style: CaptionStyle;
  pageDurationMs: number;
}) => {
  const base = getCaptionEnterExitMs(preset, style);

  if (preset !== "cascade") {
    return base;
  }

  return { enterMs: 480, exitMs: 220 };
};

const getCascadeScheduling = (pageDurationMs: number) => {
  const safeDurationMs = Math.max(1, pageDurationMs);
  const settledHoldMs = Math.min(180, Math.max(120, safeDurationMs * 0.18));
  const entryVisibilityDelayMs = 28;
  return {
    settledHoldMs,
    entryVisibilityDelayMs,
  };
};

const getCaptionVariant = ({
  style,
  activeBlock,
  activePage,
}: {
  style: CaptionStyle;
  activeBlock: CaptionBlock | null;
  activePage: CaptionPage | null;
}) => {
  const token =
    style === "tiktok"
      ? activePage
        ? `${activePage.startMs}:${activePage.durationMs}:${activePage.text}`
        : null
      : activeBlock
        ? `${activeBlock.startMs}:${activeBlock.endMs}:${activeBlock.text}`
        : null;
  if (!token) return 0;
  return hashString(token) % 4;
};

const getMotionPreset = (
  preset: CaptionAnimationPreset,
  captionVariant: number
): CaptionMotionPreset => {
  if (preset === "minimal") {
    return {
      fromY: 8,
      fromX: 0,
      fromScale: 0.996,
      fromRotate: 0,
      blurFrom: 1.2,
      pulseAmount: 0.006,
      depthFrom: 8,
    };
  }
  if (preset === "punch") {
    return {
      fromY: 20,
      fromX: captionVariant === 1 ? -16 : captionVariant === 2 ? 14 : 0,
      fromScale: captionVariant === 2 ? 1.04 : 0.94,
      fromRotate: captionVariant === 1 ? -1.6 : captionVariant === 2 ? 1.2 : 0,
      blurFrom: 2.6,
      pulseAmount: 0.04,
      depthFrom: 18,
    };
  }
  if (preset === "cascade") {
    return {
      fromY: 22,
      fromX: captionVariant === 1 ? -14 : captionVariant === 2 ? 14 : 0,
      fromScale: 0.95,
      fromRotate: captionVariant === 1 ? -0.6 : captionVariant === 2 ? 0.6 : 0,
      blurFrom: 2.8,
      pulseAmount: 0.018,
      depthFrom: 18,
    };
  }
  if (preset === "cinematic") {
    return {
      fromY: captionVariant === 1 ? 34 : 26,
      fromX: captionVariant === 2 ? 8 : captionVariant === 1 ? -8 : 0,
      fromScale: 0.955,
      fromRotate: captionVariant === 1 ? -0.4 : captionVariant === 2 ? 0.35 : 0,
      blurFrom: 6.5,
      pulseAmount: 0.012,
      depthFrom: 42,
    };
  }

  return {
    fromY: captionVariant === 1 ? 24 : captionVariant === 2 ? 14 : 18,
    fromX: captionVariant === 1 ? -12 : captionVariant === 2 ? 10 : 0,
    fromScale: captionVariant === 1 ? 0.97 : captionVariant === 2 ? 1.015 : 0.985,
    fromRotate: captionVariant === 1 ? -0.8 : captionVariant === 2 ? 0.6 : 0,
    blurFrom: 4,
    pulseAmount: 0.018,
    depthFrom: 32,
  };
};

const snapPx = (value: number) => Math.round(value);

const getCascadePageMotion = (
  presence: number,
  pageIndex: number,
  pageDurationMs: number,
  compositionWidth: number,
  compositionHeight: number
) => {
  const travel = easeInOutSineWide01(presence);
  const settle = easeOutSine01(presence);
  const motionFactor = 0.92;
  const safeWidth = Math.max(320, compositionWidth);
  const safeHeight = Math.max(320, compositionHeight);
  const overscanX = 132;
  const overscanY = 154;
  const bottomTravel = safeHeight * 0.5 + overscanY;
  const sideTravel = safeWidth * 0.5 + overscanX;
  const centerLift = safeHeight * 0.072 * motionFactor;
  const sideArc = safeHeight * 0.036 * motionFactor;

  const cycleIndex = ((pageIndex % 3) + 3) % 3;

  if (cycleIndex === 0) {
    return {
      translateX: 0,
      translateY: lerp(bottomTravel * motionFactor, 0, settle),
      scale: lerp(1 - 0.12 * motionFactor, 1, settle),
      rotate: 0,
      blur: lerp(4, 0, settle),
      depth: lerp(18 * motionFactor, 0, settle),
      pulse: 1 + Math.sin(settle * Math.PI) * 0.0035,
    };
  }

  const fromLeft = cycleIndex === 1;
  const side = fromLeft ? -1 : 1;
  const lateralStart = fromLeft ? -sideTravel : sideTravel;
  const arcBias = side * safeWidth * 0.01 * motionFactor;

  return {
    translateX: lerp(lateralStart * motionFactor, 0, settle),
    translateY:
      lerp(centerLift, 0, settle) -
      Math.sin(travel * Math.PI) * sideArc +
      arcBias * (1 - settle),
    scale: lerp(1 - 0.085 * motionFactor, 1, settle),
    rotate: side * (1 - settle) * 0.45,
    blur: lerp(3.8, 0, settle),
    depth: lerp(16 * motionFactor, 0, settle),
    pulse: 1 + Math.sin(settle * Math.PI) * 0.003,
  };
};

const getProgress = (value: number, start: number, end: number) => {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp((value - start) / (end - start), 0, 1);
};

export const resolveCaptionRuntime = ({
  captionsEnabled,
  captionsStyle,
  captionsAnimationPreset,
  captionsWordsPerPage,
  captionsWords,
  captionsGlobalOffsetMs,
  timelineMs,
  rangeStartMs,
  rangeEndMs,
  compositionWidth,
  compositionHeight,
}: {
  captionsEnabled: boolean;
  captionsStyle: CaptionStyle;
  captionsAnimationPreset: CaptionAnimationPreset;
  captionsWordsPerPage?: number;
  captionsWords: CaptionWord[];
  captionsGlobalOffsetMs?: number;
  timelineMs: number;
  rangeStartMs?: number;
  rangeEndMs?: number | null;
  compositionWidth: number;
  compositionHeight: number;
}) => {
  const effectiveCaptionsStyle: CaptionStyle = captionsStyle;
  const globalOffsetMs = Math.round(captionsGlobalOffsetMs ?? 0);
  const offsetWords =
    globalOffsetMs === 0
      ? captionsWords
      : captionsWords.map((word) => {
          const startMs = Math.max(0, word.startMs + globalOffsetMs);
          const endMs = Math.max(startMs + 1, word.endMs + globalOffsetMs);
          return { ...word, startMs, endMs };
        });
  const offsetBlocks = buildCaptionBlocksFromWords(offsetWords, {
    maxWordsPerSegment: 1,
    maxGapMs: 900,
  });

  const hasRangeBounds =
    Number.isFinite(rangeStartMs ?? NaN) || Number.isFinite(rangeEndMs ?? NaN);
  const clippedRangeStartMs = hasRangeBounds
    ? Math.max(0, Math.round(rangeStartMs ?? 0))
    : 0;
  const clippedRangeEndMs =
    hasRangeBounds && Number.isFinite(rangeEndMs ?? NaN)
      ? Math.max(clippedRangeStartMs + 1, Math.round(rangeEndMs as number))
      : null;

  const runtimeWords = hasRangeBounds
    ? offsetWords
        .map((segment) => {
          const startMs = Math.max(segment.startMs, clippedRangeStartMs);
          const boundedEnd = clippedRangeEndMs ?? segment.endMs;
          const endMs = Math.min(segment.endMs, boundedEnd);
          if (endMs <= startMs) return null;
          return {
            ...segment,
            startMs: startMs - clippedRangeStartMs,
            endMs: Math.max(startMs + 1, endMs) - clippedRangeStartMs,
          };
        })
        .filter((segment): segment is CaptionWord => segment !== null)
    : offsetWords;
  const runtimeBlocks = hasRangeBounds
    ? offsetBlocks
        .map((block) => {
          const startMs = Math.max(block.startMs, clippedRangeStartMs);
          const boundedEnd = clippedRangeEndMs ?? block.endMs;
          const endMs = Math.min(block.endMs, boundedEnd);
          if (endMs <= startMs) return null;
          const words = runtimeWords.filter(
            (word) => word.startMs >= startMs - clippedRangeStartMs && word.endMs <= endMs - clippedRangeStartMs
          );
          return {
            ...block,
            startMs: startMs - clippedRangeStartMs,
            endMs: Math.max(startMs + 1, endMs) - clippedRangeStartMs,
            words,
          };
        })
        .filter((block): block is RuntimeCaptionBlock => block !== null)
    : offsetBlocks.map((block) => ({
        ...block,
        words:
          block.words?.length && block.words.length > 0
            ? block.words
            : runtimeWords.filter(
                (word) => word.startMs >= block.startMs && word.endMs <= block.endMs
              ),
      }));

  if (!captionsEnabled || runtimeWords.length === 0) {
    return {
      effectiveCaptionsStyle,
      captionBlocks: [] as RuntimeCaptionBlock[],
      captionPages: [] as CaptionPage[],
      activeCaptionBlock: null as RuntimeCaptionBlock | null,
      activeCaptionPage: null as CaptionPage | null,
      activeCaptionPageIndex: -1,
      activeCaption: null as string | null,
      hasActiveCaption: false,
      captionOpacity: 0,
      captionTransform: "translate3d(0px, 0px, 0px) rotate(0deg) scale(1)",
      captionBlur: 0,
    };
  }

  const safeWordsPerPage = clamp(
    Math.round(captionsWordsPerPage ?? getWordsPerPage(captionsAnimationPreset)),
    1,
    12
  );

  const activeCaptionBlock =
    runtimeBlocks.find(
      (item) => timelineMs >= item.startMs && timelineMs < item.endMs
    ) ?? runtimeBlocks.find((item) =>
      item.words.some((word) => timelineMs >= word.startMs && timelineMs < word.endMs)
    ) ?? null;

  const captionPages = buildCaptionPages(runtimeBlocks, safeWordsPerPage);

  const activeCaptionPage =
    captionPages.find(
      (page) => timelineMs >= page.startMs && timelineMs < page.startMs + page.durationMs
    ) ?? null;
  const activeCaptionPageIndex = activeCaptionPage
    ? captionPages.findIndex((page) => page === activeCaptionPage)
    : -1;
  const activeCaption =
    effectiveCaptionsStyle === "tiktok"
      ? activeCaptionPage?.text ?? null
      : activeCaptionPage?.text ?? activeCaptionBlock?.text?.trim() ?? null;
  const hasActiveCaption = Boolean(activeCaption && activeCaption.trim().length > 0);

  const activePageDurationMs = activeCaptionPage?.durationMs ?? 0;
  const { enterMs, exitMs } = getAdaptiveCaptionTimings({
    preset: captionsAnimationPreset,
    style: effectiveCaptionsStyle,
    pageDurationMs: activePageDurationMs,
  });
  const { settledHoldMs, entryVisibilityDelayMs } =
    captionsAnimationPreset === "cascade"
      ? getCascadeScheduling(activePageDurationMs)
      : { settledHoldMs: 0, entryVisibilityDelayMs: 0 };

  // Animate enter/exit per caption page for all styles to avoid word-level jitter.
  const elapsedMs = activeCaptionPage
    ? Math.max(0, timelineMs - activeCaptionPage.startMs)
    : 0;

  const remainingMs = activeCaptionPage
    ? Math.max(0, activeCaptionPage.startMs + activeCaptionPage.durationMs - timelineMs)
    : 0;

  const enterProgress = getProgress(elapsedMs, 0, enterMs);
  const exitLeadMs =
    captionsAnimationPreset === "cascade"
      ? Math.max(0, remainingMs - settledHoldMs)
      : remainingMs;
  const exitProgress = getProgress(exitLeadMs, 0, exitMs);
  const presence =
    captionsAnimationPreset === "cascade"
      ? enterProgress
      : Math.min(enterProgress, exitProgress);
  const captionVariant = getCaptionVariant({
    style: effectiveCaptionsStyle,
    activeBlock: activeCaptionBlock,
    activePage: activeCaptionPage,
  });
  const motionPreset = getMotionPreset(captionsAnimationPreset, captionVariant);
  const cascadeMotion =
    captionsAnimationPreset === "cascade" && activeCaptionPageIndex >= 0
      ? getCascadePageMotion(
          presence,
          activeCaptionPageIndex,
          activePageDurationMs,
          compositionWidth,
          compositionHeight
        )
      : null;

  // Keep TikTok style visually stable to avoid micro-jitter on caption page changes.
  const useStableTiktokMotion =
    effectiveCaptionsStyle === "tiktok" &&
    captionsAnimationPreset !== "cascade" &&
    captionsAnimationPreset !== "punch" &&
    captionsAnimationPreset !== "cinematic";
  const captionTranslateY = useStableTiktokMotion
    ? lerp(10, 0, presence)
    : cascadeMotion
      ? cascadeMotion.translateY
    : lerp(motionPreset.fromY, 0, presence);
  const captionTranslateX = useStableTiktokMotion
    ? 0
    : cascadeMotion
      ? cascadeMotion.translateX
    : lerp(motionPreset.fromX, 0, presence);
  const captionScale = useStableTiktokMotion
    ? lerp(0.992, 1, presence)
    : cascadeMotion
      ? cascadeMotion.scale
    : lerp(motionPreset.fromScale, 1, presence);
  const captionRotate = useStableTiktokMotion
    ? 0
    : cascadeMotion
      ? cascadeMotion.rotate
    : lerp(motionPreset.fromRotate, 0, presence);
  const captionBlur = useStableTiktokMotion
    ? lerp(1.4, 0, presence)
    : cascadeMotion
      ? cascadeMotion.blur
    : lerp(motionPreset.blurFrom, 0, presence);
  const captionPulse = useStableTiktokMotion
    ? 1
    : cascadeMotion
      ? cascadeMotion.pulse
      : 1 + Math.sin(enterProgress * Math.PI) * motionPreset.pulseAmount;
  const captionDepth = useStableTiktokMotion
    ? 0
    : cascadeMotion
      ? cascadeMotion.depth
      : lerp(motionPreset.depthFrom, 0, presence);
  const cascadeVisibleEnterMs =
    captionsAnimationPreset === "cascade"
      ? Math.max(entryVisibilityDelayMs + 1, 320)
      : 0;
  const captionOpacity =
    captionsAnimationPreset === "cascade"
      ? clamp(
          getProgress(
            elapsedMs,
            entryVisibilityDelayMs,
            cascadeVisibleEnterMs
          ),
          0,
          1
        )
      : clamp(presence, 0, 1);
  const captionTransform = `translate3d(${snapPx(captionTranslateX).toFixed(1)}px, ${snapPx(
    captionTranslateY
  ).toFixed(1)}px, ${snapPx(captionDepth).toFixed(1)}px) rotate(${captionRotate.toFixed(
    2
  )}deg) scale(${(
    captionScale * captionPulse
  ).toFixed(3)})`;

  return {
    effectiveCaptionsStyle,
    captionBlocks: runtimeBlocks,
    captionPages,
    activeCaptionBlock,
    activeCaptionPage,
    activeCaptionPageIndex,
    activeCaption,
    hasActiveCaption,
    captionOpacity,
    captionTransform,
    captionBlur,
  };
};
