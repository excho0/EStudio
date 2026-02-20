import type { CaptionSegment } from "../../types/captions";
import { hashString } from "./hash";
import { clamp, lerp } from "./math";

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
  segments: CaptionSegment[],
  wordsPerPage: number
) => {
  const tokens: CaptionToken[] = [];

  for (const segment of segments) {
    const rawWords = segment.text
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (rawWords.length === 0) continue;
    const span = Math.max(1, segment.endMs - segment.startMs);
    const tokenDuration = span / rawWords.length;
    for (let i = 0; i < rawWords.length; i += 1) {
      const fromMs = Math.round(segment.startMs + i * tokenDuration);
      const toMs =
        i === rawWords.length - 1
          ? segment.endMs
          : Math.round(segment.startMs + (i + 1) * tokenDuration);
      tokens.push({
        text: rawWords[i],
        fromMs,
        toMs: Math.max(fromMs + 1, toMs),
      });
    }
  }

  const pages: CaptionPage[] = [];
  let cursor = 0;
  while (cursor < tokens.length) {
    const slice = tokens.slice(cursor, cursor + wordsPerPage);
    if (slice.length === 0) break;
    const startMs = slice[0].fromMs;
    const durationMs = Math.max(1, slice[slice.length - 1].toMs - startMs);
    pages.push({
      text: slice.map((token) => token.text).join(" "),
      startMs,
      durationMs,
      tokens: slice,
    });
    cursor += wordsPerPage;
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
  activeSegment,
  activePage,
}: {
  style: CaptionStyle;
  activeSegment: CaptionSegment | null;
  activePage: CaptionPage | null;
}) => {
  const token =
    style === "tiktok"
      ? activePage
        ? `${activePage.startMs}:${activePage.durationMs}:${activePage.text}`
        : null
      : activeSegment
        ? `${activeSegment.startMs}:${activeSegment.endMs}:${activeSegment.text}`
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

const getProgress = (value: number, start: number, end: number) => {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp((value - start) / (end - start), 0, 1);
};

export const resolveCaptionRuntime = ({
  captionsEnabled,
  captionsStyle,
  captionsAnimationPreset,
  captionsWordsPerPage,
  captionsSegments,
  timelineMs,
}: {
  captionsEnabled: boolean;
  captionsStyle: CaptionStyle;
  captionsAnimationPreset: CaptionAnimationPreset;
  captionsWordsPerPage?: number;
  captionsSegments: CaptionSegment[];
  timelineMs: number;
}) => {
  const effectiveCaptionsStyle: CaptionStyle = captionsStyle;

  if (!captionsEnabled || captionsSegments.length === 0) {
    return {
      effectiveCaptionsStyle,
      captionPages: [] as CaptionPage[],
      activeCaptionSegment: null as CaptionSegment | null,
      activeCaptionPage: null as CaptionPage | null,
      activeCaption: null as string | null,
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

  const activeCaptionSegment =
    captionsSegments.find(
      (item) => timelineMs >= item.startMs && timelineMs < item.endMs
    ) ?? null;

  const captionPages = buildCaptionPages(captionsSegments, safeWordsPerPage);

  const activeCaptionPage =
    captionPages.find(
      (page) => timelineMs >= page.startMs && timelineMs < page.startMs + page.durationMs
    ) ?? null;
  const activeCaption =
    effectiveCaptionsStyle === "tiktok"
      ? activeCaptionPage?.text ?? null
      : activeCaptionPage?.text ?? activeCaptionSegment?.text?.trim() ?? null;

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
    activeSegment: activeCaptionSegment,
    activePage: activeCaptionPage,
  });
  const motionPreset = getMotionPreset(captionsAnimationPreset, captionVariant);
  const ease = smoothStep(presence);

  const captionTranslateY = lerp(motionPreset.fromY, 0, presence);
  const captionTranslateX = lerp(motionPreset.fromX, 0, presence);
  const captionScale = lerp(motionPreset.fromScale, 1, presence);
  const captionRotate = lerp(motionPreset.fromRotate, 0, presence);
  const captionBlur = lerp(motionPreset.blurFrom, 0, presence);
  const captionPulse = 1 + Math.sin(enterProgress * Math.PI) * motionPreset.pulseAmount * ease;
  const captionDepth = lerp(motionPreset.depthFrom, 0, ease);
  const captionOpacity = clamp(ease, 0, 1);
  const captionTransform = `translate3d(${captionTranslateX.toFixed(2)}px, ${captionTranslateY.toFixed(
    2
  )}px, ${captionDepth.toFixed(2)}px) rotate(${captionRotate.toFixed(2)}deg) scale(${(
    captionScale * captionPulse
  ).toFixed(3)})`;

  return {
    effectiveCaptionsStyle,
    captionPages,
    activeCaptionSegment,
    activeCaptionPage,
    activeCaption,
    captionOpacity,
    captionTransform,
    captionBlur,
  };
};
