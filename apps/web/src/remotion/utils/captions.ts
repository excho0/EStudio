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

export type CaptionAnimationPreset = "smooth" | "cinematic" | "punch" | "minimal";
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
  if (preset === "punch") return 3;
  return 4;
};

const getCaptionEnterExitMs = (
  preset: CaptionAnimationPreset,
  style: CaptionStyle
) => {
  const enterMs =
    preset === "minimal"
      ? 90
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
      : preset === "punch"
        ? 100
        : preset === "cinematic"
          ? 200
          : style === "tiktok"
            ? 140
            : 120;

  return { enterMs, exitMs };
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

const smoothStep = (value: number) => value * value * (3 - 2 * value);

const snapPx = (value: number) => Math.round(value);

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
  const activeCaption =
    effectiveCaptionsStyle === "tiktok"
      ? activeCaptionPage?.text ?? null
      : activeCaptionPage?.text ?? activeCaptionBlock?.text?.trim() ?? null;
  const hasActiveCaption = Boolean(activeCaption && activeCaption.trim().length > 0);

  const { enterMs, exitMs } = getCaptionEnterExitMs(
    captionsAnimationPreset,
    effectiveCaptionsStyle
  );

  // Animate enter/exit per caption page for all styles to avoid word-level jitter.
  const elapsedMs = activeCaptionPage
    ? Math.max(0, timelineMs - activeCaptionPage.startMs)
    : 0;

  const remainingMs = activeCaptionPage
    ? Math.max(0, activeCaptionPage.startMs + activeCaptionPage.durationMs - timelineMs)
    : 0;

  const enterProgress = getProgress(elapsedMs, 0, enterMs);
  const exitProgress = getProgress(remainingMs, 0, exitMs);
  const presence = Math.min(enterProgress, exitProgress);
  const captionVariant = getCaptionVariant({
    style: effectiveCaptionsStyle,
    activeBlock: activeCaptionBlock,
    activePage: activeCaptionPage,
  });
  const motionPreset = getMotionPreset(captionsAnimationPreset, captionVariant);
  const ease = smoothStep(presence);

  // Keep TikTok style visually stable to avoid micro-jitter on caption page changes.
  const useStableTiktokMotion = effectiveCaptionsStyle === "tiktok";
  const captionTranslateY = useStableTiktokMotion
    ? lerp(10, 0, presence)
    : lerp(motionPreset.fromY, 0, presence);
  const captionTranslateX = useStableTiktokMotion
    ? 0
    : lerp(motionPreset.fromX, 0, presence);
  const captionScale = useStableTiktokMotion
    ? lerp(0.992, 1, presence)
    : lerp(motionPreset.fromScale, 1, presence);
  const captionRotate = useStableTiktokMotion
    ? 0
    : lerp(motionPreset.fromRotate, 0, presence);
  const captionBlur = useStableTiktokMotion
    ? lerp(1.4, 0, presence)
    : lerp(motionPreset.blurFrom, 0, presence);
  const captionPulse = useStableTiktokMotion
    ? 1
    : 1 + Math.sin(enterProgress * Math.PI) * motionPreset.pulseAmount * ease;
  const captionDepth = useStableTiktokMotion ? 0 : lerp(motionPreset.depthFrom, 0, ease);
  const captionOpacity = clamp(ease, 0, 1);
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
    activeCaption,
    hasActiveCaption,
    captionOpacity,
    captionTransform,
    captionBlur,
  };
};
