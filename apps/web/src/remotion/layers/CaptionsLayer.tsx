import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { clamp, lerp } from "@estudio/utils";
import {
  hexToRgba,
  mixHex,
  type CaptionAnimationPreset,
  type CaptionPage,
} from "../utils";
import type { CaptionBlock } from "../../types/captions";

const CAPTION_FONT_STACK =
  "Inter, Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type CaptionsLayerProps = {
  captionsEnabled: boolean;
  captionsPosition: "top" | "center" | "bottom" | "custom";
  captionsOffsetX: number;
  captionsOffsetY: number;
  captionsScalePercent: number;
  captionsAnimationPreset: CaptionAnimationPreset;
  effectiveCaptionsStyle: "subtitle" | "tiktok";
  captionBlocks: CaptionBlock[];
  captionPages: CaptionPage[];
  hasActiveCaption: boolean;
  fps: number;
  timelineMs: number;
  captionBlur: number;
  captionHighlightColor: string;
  layerOpacity: number;
  compositionWidth: number;
  compositionHeight: number;
};

const easeInOutSine01 = (value: number) => 0.5 - 0.5 * Math.cos(Math.PI * value);
const easeOutCubic01 = (value: number) => 1 - Math.pow(1 - value, 3);
const easeInCubic01 = (value: number) => value * value * value;
const easeOutQuint01 = (value: number) => 1 - Math.pow(1 - value, 5);
const CAPTION_GAP_HIDE_THRESHOLD_MS = 5000;
const CAPTION_END_GRACE_MS = 220;
const CASCADE_PAGE_STAGE_MS = 72;
const CASCADE_ENTER_MS = 320;
const CASCADE_EXIT_MS = 180;
const CASCADE_HOLD_MS = 120;

const getTokenHighlightStrength = (
  tokenFromMs: number,
  tokenToMs: number,
  timelineMs: number
) => {
  const tokenDuration = Math.max(1, tokenToMs - tokenFromMs);
  // Wider boundary blend for smoother crossfade between adjacent words.
  const edgeMs = Math.max(26, Math.min(62, tokenDuration * 0.24));

  const enterStart = tokenFromMs - edgeMs;
  const enterEnd = tokenFromMs + edgeMs;
  const exitStart = tokenToMs - edgeMs;
  const exitEnd = tokenToMs + edgeMs;

  const enterT = Math.max(
    0,
    Math.min(1, (timelineMs - enterStart) / Math.max(1, enterEnd - enterStart))
  );
  const exitT = Math.max(
    0,
    Math.min(1, (timelineMs - exitStart) / Math.max(1, exitEnd - exitStart))
  );

  const enter = easeInOutSine01(enterT);
  const exit = 1 - easeInOutSine01(exitT);
  return Math.max(0, Math.min(1, enter * exit));
};

type CaptionTokenStyleVariant = "subtitle" | "tiktok";

const getCaptionPageWindow = (
  page: CaptionPage,
  nextPage: CaptionPage | null,
  fps: number,
  captionBlocks: CaptionBlock[],
  preset: CaptionAnimationPreset
) => {
  const naturalEndMs =
    page.tokens.length > 0
      ? page.tokens[page.tokens.length - 1].toMs
      : page.startMs + page.durationMs;
  const prevSegment = [...captionBlocks]
    .reverse()
    .find((segment) => segment.endMs <= naturalEndMs + 1);
  const nextSegment = prevSegment
    ? captionBlocks.find((segment) => segment.startMs >= prevSegment.endMs)
    : null;
  const segmentGapMs =
    prevSegment && nextSegment ? nextSegment.startMs - prevSegment.endMs : null;
  const nextStartMs = nextPage?.startMs ?? null;
  const hasLongGap = (segmentGapMs ?? -1) >= CAPTION_GAP_HIDE_THRESHOLD_MS;
  const stagedEndMs =
    nextStartMs === null
      ? null
      : nextStartMs -
        (preset === "cascade"
          ? clamp(Math.round(page.durationMs * 0.06), 28, CASCADE_PAGE_STAGE_MS)
          : 0);
  const naturalGraceEndMs = naturalEndMs + CAPTION_END_GRACE_MS;
  const cappedEndMs = hasLongGap
    ? naturalGraceEndMs
    : preset === "cascade" && stagedEndMs !== null
      ? Math.max(naturalEndMs, Math.min(naturalGraceEndMs, stagedEndMs))
      : Math.max(naturalGraceEndMs, stagedEndMs ?? naturalGraceEndMs);
  const startFrame = Math.floor((page.startMs / 1000) * fps);
  const endFrame = Math.max(
    startFrame + 1,
    Math.ceil((cappedEndMs / 1000) * fps)
  );
  const durationInFrames = Math.max(1, endFrame - startFrame);
  return { startFrame, durationInFrames, endMs: cappedEndMs };
};

const getCascadeExitTransform = (pageIndex: number, exitProgress: number) => {
  const exitAmount = 1 - exitProgress;
  if (pageIndex <= 0) {
    return {
      translateX: 0,
      translateY: exitAmount * 220,
      scale: 1 - exitAmount * 0.08,
      rotate: 0,
      blur: exitAmount * 2.6,
    };
  }

  const cycleIndex = ((pageIndex % 3) + 3) % 3;
  if (cycleIndex === 0) {
    return {
      translateX: 0,
      translateY: exitAmount * 220,
      scale: 1 - exitAmount * 0.08,
      rotate: 0,
      blur: exitAmount * 2.6,
    };
  }

  const side = cycleIndex === 1 ? -1 : 1;
  return {
    translateX: side * exitAmount * 260,
    translateY: exitAmount * 48,
    scale: 1 - exitAmount * 0.06,
    rotate: side * exitAmount * 0.4,
    blur: exitAmount * 2.2,
  };
};

type CascadeScheduleEntry = {
  visibleStartMs: number;
  exitStartMs: number;
  visibleEndMs: number;
};

type CaptionPageWindow = {
  startFrame: number;
  durationInFrames: number;
  endMs: number;
  startMs: number;
};

type GenericScheduleEntry = {
  visibleStartMs: number;
  exitStartMs: number;
  visibleEndMs: number;
};

const getGenericMotionPreset = (
  preset: CaptionAnimationPreset,
  variant: number,
  isTiktok: boolean
) => {
  if (preset === "minimal") {
    return {
      fromY: 8,
      fromX: 0,
      fromScale: 0.996,
      fromRotate: 0,
      blurFrom: 1.2,
      pulseAmount: 0.006,
    };
  }
  if (preset === "punch") {
    return {
      fromY: 20,
      fromX: variant === 1 ? -16 : variant === 2 ? 14 : 0,
      fromScale: variant === 2 ? 1.04 : 0.94,
      fromRotate: variant === 1 ? -1.6 : variant === 2 ? 1.2 : 0,
      blurFrom: 2.6,
      pulseAmount: 0.04,
    };
  }
  if (preset === "cinematic") {
    return {
      fromY: variant === 1 ? 34 : 26,
      fromX: variant === 2 ? 8 : variant === 1 ? -8 : 0,
      fromScale: 0.955,
      fromRotate: variant === 1 ? -0.4 : variant === 2 ? 0.35 : 0,
      blurFrom: 6.5,
      pulseAmount: 0.012,
    };
  }
  if (isTiktok) {
    return {
      fromY: 10,
      fromX: 0,
      fromScale: 0.992,
      fromRotate: 0,
      blurFrom: 1.4,
      pulseAmount: 0,
    };
  }
  return {
    fromY: variant === 1 ? 24 : variant === 2 ? 14 : 18,
    fromX: variant === 1 ? -12 : variant === 2 ? 10 : 0,
    fromScale: variant === 1 ? 0.97 : variant === 2 ? 1.015 : 0.985,
    fromRotate: variant === 1 ? -0.8 : variant === 2 ? 0.6 : 0,
    blurFrom: 4,
    pulseAmount: 0.018,
  };
};

const getCascadeEntryTransform = ({
  pageIndex,
  enterProgress,
  compositionWidth,
  compositionHeight,
}: {
  pageIndex: number;
  enterProgress: number;
  compositionWidth: number;
  compositionHeight: number;
}) => {
  const safeWidth = Math.max(320, compositionWidth);
  const safeHeight = Math.max(320, compositionHeight);
  const overscanX = 132;
  const overscanY = 154;
  const bottomTravel = safeHeight * 0.5 + overscanY;
  const sideTravel = safeWidth * 0.5 + overscanX;
  const cycleIndex = ((pageIndex % 3) + 3) % 3;
  const effectiveTravel = cycleIndex === 0 ? bottomTravel : sideTravel;
  const baseTravel = 360;
  const travelSpeedBoost = clamp(effectiveTravel / baseTravel, 1, 1.35);
  const travelProgress = clamp(enterProgress * travelSpeedBoost, 0, 1);
  const settle = easeOutQuint01(travelProgress);
  const blurEase = easeOutCubic01(travelProgress);
  const rotateEase = easeOutCubic01(travelProgress);

  if (cycleIndex === 0) {
    return {
      translateX: 0,
      translateY: lerp(bottomTravel, 0, settle),
      scale: lerp(0.9, 1, settle),
      rotate: 0,
      blur: lerp(4, 0, blurEase),
    };
  }

  const side = cycleIndex === 1 ? -1 : 1;
  return {
    translateX: lerp(side * sideTravel, 0, settle),
    translateY: lerp(34, 0, easeOutCubic01(travelProgress)),
    scale: lerp(0.94, 1, settle),
    rotate: lerp(side * 0.55, 0, rotateEase),
    blur: lerp(3.6, 0, blurEase),
  };
};

const buildCascadeSchedule = (pageWindows: Array<{ startMs: number; endMs: number }>) => {
  return pageWindows.reduce<CascadeScheduleEntry[]>((schedule, window, index) => {
    const previous = schedule[index - 1];
    const visibleStartMs =
      index === 0
        ? window.startMs
        : Math.max(window.startMs, previous?.visibleEndMs ?? window.startMs);
    const visibleEndMs = Math.max(
      window.endMs,
      visibleStartMs + CASCADE_ENTER_MS + CASCADE_HOLD_MS + CASCADE_EXIT_MS
    );
    const exitStartMs = Math.max(
      visibleStartMs + CASCADE_ENTER_MS + CASCADE_HOLD_MS,
      visibleEndMs - CASCADE_EXIT_MS
    );

    schedule.push({
      visibleStartMs,
      exitStartMs,
      visibleEndMs,
    });
    return schedule;
  }, []);
};

const buildGenericSchedule = ({
  pageWindows,
  enterMs,
  exitMs,
}: {
  pageWindows: Array<{ startMs: number; endMs: number }>;
  enterMs: number;
  exitMs: number;
}) => {
  return pageWindows.map<GenericScheduleEntry>((window, index) => {
    const nextStartMs = pageWindows[index + 1]?.startMs ?? null;
    const visibleStartMs = window.startMs;
    const visibleEndMs =
      nextStartMs === null ? window.endMs : Math.min(window.endMs, nextStartMs);
    const exitStartMs = Math.max(
      visibleStartMs + Math.min(enterMs, Math.max(80, (visibleEndMs - visibleStartMs) * 0.35)),
      visibleEndMs - exitMs
    );
    return {
      visibleStartMs,
      exitStartMs,
      visibleEndMs: Math.max(exitStartMs + 1, visibleEndMs),
    };
  });
};

const getCaptionTokenStyle = ({
  variant,
  highlightStrength,
  captionHighlightColor,
}: {
  variant: CaptionTokenStyleVariant;
  highlightStrength: number;
  captionHighlightColor: string;
}) => {
  const tokenColor = mixHex("#FFFFFF", captionHighlightColor, highlightStrength);
  if (variant === "tiktok") {
    const glowAlpha = 0.15 + highlightStrength * 0.22;
    const glowRadius = 1.4 + highlightStrength * 1.8;
    const depthAlpha = 0.18 + highlightStrength * 0.22;
    return {
      color: tokenColor,
      filter:
        highlightStrength > 0.001
          ? `brightness(${(1 + highlightStrength * 0.06).toFixed(2)})`
          : undefined,
      textShadow:
        highlightStrength > 0.001
          ? `0 -1px 0 ${hexToRgba(captionHighlightColor, depthAlpha)}, 0 1px 0 ${hexToRgba("#000000", 0.28)}, 0 0 ${glowRadius.toFixed(1)}px ${hexToRgba(
              captionHighlightColor,
              glowAlpha
            )}, 0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)`
          : "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)",
    } as const;
  }
  const glowAlpha = 0.14 + highlightStrength * 0.2;
  const glowRadius = 1.2 + highlightStrength * 1.6;
  return {
    color: tokenColor,
    textShadow:
      highlightStrength > 0.001
        ? `0 0 ${glowRadius.toFixed(1)}px ${hexToRgba(
            captionHighlightColor,
            glowAlpha
          )}, 0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)`
        : "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)",
  } as const;
};

export const CaptionsLayer: React.FC<CaptionsLayerProps> = ({
  captionsEnabled,
  captionsPosition,
  captionsOffsetX,
  captionsOffsetY,
  captionsScalePercent,
  captionsAnimationPreset,
  effectiveCaptionsStyle,
  captionBlocks,
  captionPages,
  hasActiveCaption,
  fps,
  timelineMs,
  captionBlur,
  captionHighlightColor,
  layerOpacity,
  compositionWidth,
  compositionHeight,
}) => {
  if (!captionsEnabled || !hasActiveCaption) {
    return null;
  }

  const effectiveLayerOpacity = layerOpacity;
  const captionScale = Math.max(
    0.5,
    Math.min(2, Number.isFinite(captionsScalePercent) ? captionsScalePercent / 100 : 1)
  );
  const bottomPadding = effectiveCaptionsStyle === "tiktok" ? 98 : 64;
  const topPadding = effectiveCaptionsStyle === "tiktok" ? 84 : 56;
  const customOffsetX = Number.isFinite(captionsOffsetX) ? captionsOffsetX : 0;
  const customOffsetY = Number.isFinite(captionsOffsetY) ? captionsOffsetY : 0;
  const customPositionTransform =
    captionsPosition === "custom"
      ? `translate(${customOffsetX.toFixed(1)}px, ${customOffsetY.toFixed(1)}px)`
      : undefined;
  const baseLayoutStyle = (() => {
    switch (captionsPosition) {
      case "top":
        return {
          justifyContent: "flex-start" as const,
          alignItems: "center" as const,
          padding: `${topPadding}px 24px 0`,
          textAlign: "center" as const,
        };
      case "center":
        return {
          justifyContent: "center" as const,
          alignItems: "center" as const,
          padding: "0 24px",
          textAlign: "center" as const,
        };
      case "custom":
        return {
          justifyContent: "center" as const,
          alignItems: "center" as const,
          padding: "0 24px",
          textAlign: "center" as const,
        };
      case "bottom":
      default:
        return {
          justifyContent: "flex-end" as const,
          alignItems: "center" as const,
          padding: `0 24px ${bottomPadding}px`,
          textAlign: "center" as const,
        };
    }
  })();
  const renderCaptionTokens = (
    page: CaptionPage,
    variant: CaptionTokenStyleVariant
  ) =>
    page.tokens.map((token, tokenIndex) => {
      const highlightStrength =
        page.tokens.length === 1
          ? 1
          : getTokenHighlightStrength(
              token.fromMs,
              token.toMs,
              timelineMs
            );
      const tokenStyle = getCaptionTokenStyle({
        variant,
        highlightStrength,
        captionHighlightColor,
      });
      return (
        <span
          key={`${page.startMs}-${tokenIndex}-${token.fromMs}-${token.toMs}-${token.text}`}
          style={tokenStyle}
        >
          {token.text}
          {tokenIndex < page.tokens.length - 1 ? " " : ""}
        </span>
      );
    });

  const basePageWindows: CaptionPageWindow[] = captionPages.map((page, index) => {
    const nextPage = captionPages[index + 1] ?? null;
    const { startFrame, durationInFrames, endMs } = getCaptionPageWindow(
      page,
      nextPage,
      fps,
      captionBlocks,
      captionsAnimationPreset
    );
    return {
      startFrame,
      durationInFrames,
      endMs,
      startMs: page.startMs,
    };
  });
  const cascadeSchedule =
    captionsAnimationPreset === "cascade"
      ? buildCascadeSchedule(
          basePageWindows.map((window) => ({ startMs: window.startMs, endMs: window.endMs }))
        )
      : null;
  const genericTimings =
    captionsAnimationPreset === "minimal"
      ? { enterMs: 90, exitMs: 80 }
      : captionsAnimationPreset === "punch"
        ? { enterMs: 120, exitMs: 100 }
        : captionsAnimationPreset === "cinematic"
          ? { enterMs: 240, exitMs: 200 }
          : effectiveCaptionsStyle === "tiktok"
            ? { enterMs: 180, exitMs: 140 }
            : { enterMs: 140, exitMs: 120 };
  const genericSchedule =
    captionsAnimationPreset !== "cascade"
      ? buildGenericSchedule({
          pageWindows: basePageWindows.map((window) => ({
            startMs: window.startMs,
            endMs: window.endMs,
          })),
          enterMs: genericTimings.enterMs,
          exitMs: genericTimings.exitMs,
        })
      : null;
  const pageWindows: CaptionPageWindow[] =
    captionsAnimationPreset === "cascade" && cascadeSchedule
      ? basePageWindows.map((window, index) => {
          const cascadeWindow = cascadeSchedule[index]!;
          const endMs = Math.max(window.endMs, cascadeWindow.visibleEndMs);
          const endFrame = Math.max(
            window.startFrame + 1,
            Math.ceil((endMs / 1000) * fps)
          );
          return {
            ...window,
            endMs,
            durationInFrames: Math.max(1, endFrame - window.startFrame),
          };
        })
      : basePageWindows;

  if (effectiveCaptionsStyle === "tiktok" && captionPages.length > 0) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", zIndex: 30, overflow: "visible" }}>
        {captionPages.map((page, index) => {
          const { startFrame, durationInFrames } = pageWindows[index]!;
          if (durationInFrames <= 0) return null;
          const isCascade = captionsAnimationPreset === "cascade";
          const cascadeWindow = cascadeSchedule?.[index] ?? null;
          const genericWindow = genericSchedule?.[index] ?? null;
          const cascadeVisible =
            cascadeWindow !== null &&
            timelineMs >= cascadeWindow.visibleStartMs &&
            timelineMs <= cascadeWindow.visibleEndMs;
          if (isCascade && !cascadeVisible) {
            return null;
          }
          if (!isCascade && genericWindow) {
            const genericVisible =
              timelineMs >= genericWindow.visibleStartMs &&
              timelineMs <= genericWindow.visibleEndMs;
            if (!genericVisible) {
              return null;
            }
          }
          const enterProgress = cascadeWindow
            ? clamp(
                (timelineMs - cascadeWindow.visibleStartMs) / CASCADE_ENTER_MS,
                0,
                1
              )
            : 0;
          const exitProgress = cascadeWindow
            ? clamp(
                (cascadeWindow.visibleEndMs - timelineMs) / CASCADE_EXIT_MS,
                0,
                1
              )
            : 1;
          const exitMotionProgress = easeInCubic01(exitProgress);
          const cascadeEntry = isCascade
            ? getCascadeEntryTransform({
                pageIndex: index,
                enterProgress,
                compositionWidth,
                compositionHeight,
              })
            : null;
          const cascadeExit = isCascade
            ? getCascadeExitTransform(index, exitMotionProgress)
            : null;
          const isExitingCascade = Boolean(
            isCascade && cascadeWindow && timelineMs >= cascadeWindow.exitStartMs
          );
          const pageOpacity = isCascade
            ? effectiveLayerOpacity *
              easeInOutSine01(enterProgress) *
              (isExitingCascade ? easeInOutSine01(exitProgress) : 1)
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const isExiting = Boolean(
                  visibleWindow && timelineMs >= visibleWindow.exitStartMs
                );
                return (
                  effectiveLayerOpacity *
                  easeInOutSine01(genericEnter) *
                  (isExiting ? easeInOutSine01(genericExit) : 1)
                );
              })();
          const pageOutBlur = isCascade
            ? isExitingCascade
              ? cascadeExit?.blur ?? 0
              : cascadeEntry?.blur ?? 0
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const variant = index % 4;
                const preset = getGenericMotionPreset(
                  captionsAnimationPreset,
                  variant,
                  true
                );
                const enterEase = easeOutCubic01(genericEnter);
                const exitEase = 1 - easeInOutSine01(genericExit);
                return Math.max(
                  lerp(preset.blurFrom, 0, enterEase),
                  preset.blurFrom * 0.55 * exitEase
                );
              })();
          const pageTransform = isCascade
            ? isExitingCascade
              ? `translate3d(${(cascadeExit?.translateX ?? 0).toFixed(1)}px, ${(cascadeExit?.translateY ?? 0).toFixed(
                  1
                )}px, 0px) rotate(${(cascadeExit?.rotate ?? 0).toFixed(2)}deg) scale(${(
                  cascadeExit?.scale ?? 1
                ).toFixed(3)})`
              : `translate3d(${(cascadeEntry?.translateX ?? 0).toFixed(1)}px, ${(cascadeEntry?.translateY ?? 0).toFixed(
                  1
                )}px, 0px) rotate(${(cascadeEntry?.rotate ?? 0).toFixed(2)}deg) scale(${(
                  cascadeEntry?.scale ?? 1
                ).toFixed(3)})`
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const isExiting = Boolean(
                  visibleWindow && timelineMs >= visibleWindow.exitStartMs
                );
                const variant = index % 4;
                const preset = getGenericMotionPreset(
                  captionsAnimationPreset,
                  variant,
                  true
                );
                const enterEase = easeOutCubic01(genericEnter);
                const exitEase = 1 - easeInOutSine01(genericExit);
                const translateX = isExiting
                  ? lerp(0, preset.fromX * 0.4, exitEase)
                  : lerp(preset.fromX, 0, enterEase);
                const translateY = isExiting
                  ? lerp(0, 8, exitEase)
                  : lerp(preset.fromY, 0, enterEase);
                const rotate = isExiting
                  ? lerp(0, preset.fromRotate * 0.3, exitEase)
                  : lerp(preset.fromRotate, 0, enterEase);
                const pulse =
                  1 + Math.sin(genericEnter * Math.PI) * preset.pulseAmount * 0.6;
                const scale = isExiting
                  ? lerp(1, 0.985, exitEase)
                  : lerp(preset.fromScale, 1, enterEase) * pulse;
                return `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(
                  1
                )}px, 0px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
              })();
          return (
            <Sequence
              key={`${page.startMs}-${page.text}-${index}`}
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <AbsoluteFill
                style={{
                  justifyContent: baseLayoutStyle.justifyContent,
                  alignItems: baseLayoutStyle.alignItems,
                  padding: baseLayoutStyle.padding,
                  transform: customPositionTransform,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    alignSelf: "center",
                    fontSize: 42 * captionScale,
                    fontWeight: 900,
                    lineHeight: 1.12,
                    letterSpacing: 0.2,
                    fontFamily: CAPTION_FONT_STACK,
                    fontSynthesis: "none",
                    textAlign: baseLayoutStyle.textAlign,
                    textTransform: "capitalize",
                    textShadow: "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.9)",
                    opacity: pageOpacity,
                    transform: pageTransform,
                    transformOrigin: "center bottom",
                    filter: `blur(${(captionBlur + pageOutBlur).toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                    whiteSpace: "pre-wrap",
                    maxWidth: isCascade ? "78%" : undefined,
                    overflow: "visible",
                    position: "relative",
                    zIndex: isCascade && isExitingCascade ? 2 : 1,
                  }}
                >
                  {renderCaptionTokens(page, "tiktok")}
                </div>
              </AbsoluteFill>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  if (effectiveCaptionsStyle === "subtitle" && captionPages.length > 0) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", zIndex: 30, overflow: "visible" }}>
        {captionPages.map((page, index) => {
          const { startFrame, durationInFrames } = pageWindows[index]!;
          if (durationInFrames <= 0) return null;
          const isCascade = captionsAnimationPreset === "cascade";
          const cascadeWindow = cascadeSchedule?.[index] ?? null;
          const genericWindow = genericSchedule?.[index] ?? null;
          const cascadeVisible =
            cascadeWindow !== null &&
            timelineMs >= cascadeWindow.visibleStartMs &&
            timelineMs <= cascadeWindow.visibleEndMs;
          if (isCascade && !cascadeVisible) {
            return null;
          }
          if (!isCascade && genericWindow) {
            const genericVisible =
              timelineMs >= genericWindow.visibleStartMs &&
              timelineMs <= genericWindow.visibleEndMs;
            if (!genericVisible) {
              return null;
            }
          }
          const enterProgress = cascadeWindow
            ? clamp(
                (timelineMs - cascadeWindow.visibleStartMs) / CASCADE_ENTER_MS,
                0,
                1
              )
            : 0;
          const exitProgress = cascadeWindow
            ? clamp(
                (cascadeWindow.visibleEndMs - timelineMs) / CASCADE_EXIT_MS,
                0,
                1
              )
            : 1;
          const exitMotionProgress = easeInCubic01(exitProgress);
          const cascadeEntry = isCascade
            ? getCascadeEntryTransform({
                pageIndex: index,
                enterProgress,
                compositionWidth,
                compositionHeight,
              })
            : null;
          const cascadeExit = isCascade
            ? getCascadeExitTransform(index, exitMotionProgress)
            : null;
          const isExitingCascade = Boolean(
            isCascade && cascadeWindow && timelineMs >= cascadeWindow.exitStartMs
          );
          const pageOpacity = isCascade
            ? effectiveLayerOpacity *
              easeInOutSine01(enterProgress) *
              (isExitingCascade ? easeInOutSine01(exitProgress) : 1)
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const isExiting = Boolean(
                  visibleWindow && timelineMs >= visibleWindow.exitStartMs
                );
                return (
                  effectiveLayerOpacity *
                  easeInOutSine01(genericEnter) *
                  (isExiting ? easeInOutSine01(genericExit) : 1)
                );
              })();
          const pageOutBlur = isCascade
            ? isExitingCascade
              ? cascadeExit?.blur ?? 0
              : cascadeEntry?.blur ?? 0
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const variant = index % 4;
                const preset = getGenericMotionPreset(
                  captionsAnimationPreset,
                  variant,
                  false
                );
                const enterEase = easeOutCubic01(genericEnter);
                const exitEase = 1 - easeInOutSine01(genericExit);
                return Math.max(
                  lerp(preset.blurFrom, 0, enterEase),
                  preset.blurFrom * 0.5 * exitEase
                );
              })();
          const pageTransform = isCascade
            ? isExitingCascade
              ? `translate3d(${(cascadeExit?.translateX ?? 0).toFixed(1)}px, ${(cascadeExit?.translateY ?? 0).toFixed(
                  1
                )}px, 0px) rotate(${(cascadeExit?.rotate ?? 0).toFixed(2)}deg) scale(${(
                  cascadeExit?.scale ?? 1
                ).toFixed(3)})`
              : `translate3d(${(cascadeEntry?.translateX ?? 0).toFixed(1)}px, ${(cascadeEntry?.translateY ?? 0).toFixed(
                  1
                )}px, 0px) rotate(${(cascadeEntry?.rotate ?? 0).toFixed(2)}deg) scale(${(
                  cascadeEntry?.scale ?? 1
                ).toFixed(3)})`
            : (() => {
                const visibleWindow = genericWindow;
                const genericEnter = visibleWindow
                  ? clamp(
                      (timelineMs - visibleWindow.visibleStartMs) / genericTimings.enterMs,
                      0,
                      1
                    )
                  : 0;
                const genericExit = visibleWindow
                  ? clamp(
                      (visibleWindow.visibleEndMs - timelineMs) / genericTimings.exitMs,
                      0,
                      1
                    )
                  : 1;
                const isExiting = Boolean(
                  visibleWindow && timelineMs >= visibleWindow.exitStartMs
                );
                const variant = index % 4;
                const preset = getGenericMotionPreset(
                  captionsAnimationPreset,
                  variant,
                  false
                );
                const enterEase = easeOutCubic01(genericEnter);
                const exitEase = 1 - easeInOutSine01(genericExit);
                const translateX = isExiting
                  ? lerp(0, preset.fromX * 0.35, exitEase)
                  : lerp(preset.fromX, 0, enterEase);
                const translateY = isExiting
                  ? lerp(0, 6, exitEase)
                  : lerp(preset.fromY, 0, enterEase);
                const rotate = isExiting
                  ? lerp(0, preset.fromRotate * 0.25, exitEase)
                  : lerp(preset.fromRotate, 0, enterEase);
                const pulse =
                  1 + Math.sin(genericEnter * Math.PI) * preset.pulseAmount * 0.6;
                const scale = isExiting
                  ? lerp(1, 0.988, exitEase)
                  : lerp(preset.fromScale, 1, enterEase) * pulse;
                return `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(
                  1
                )}px, 0px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
              })();
          return (
            <Sequence
              key={`${page.startMs}-${page.text}-${index}`}
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <AbsoluteFill
                style={{
                  justifyContent: baseLayoutStyle.justifyContent,
                  alignItems: baseLayoutStyle.alignItems,
                  padding: baseLayoutStyle.padding,
                  transform: customPositionTransform,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    maxWidth: isCascade ? "78%" : "86%",
                    alignSelf: "center",
                    fontSize: 40 * captionScale,
                    fontWeight: 760,
                    lineHeight: 1.2,
                    fontFamily: CAPTION_FONT_STACK,
                    fontSynthesis: "none",
                    textAlign: baseLayoutStyle.textAlign,
                    color: "#FFFFFF",
                    background:
                      "linear-gradient(180deg, rgba(18,22,32,0.68) 0%, rgba(8,10,16,0.56) 100%)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 14,
                    padding: "12px 20px",
                    textShadow: "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)",
                    backdropFilter: "blur(4px)",
                    boxShadow:
                      "0 14px 38px rgba(0,0,0,0.36), inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 24px rgba(255,255,255,0.08)",
                    opacity: pageOpacity,
                    transform: pageTransform,
                    transformOrigin: "center bottom",
                    filter: `blur(${(captionBlur + pageOutBlur).toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                    overflow: "visible",
                    position: "relative",
                    zIndex: isCascade && isExitingCascade ? 2 : 1,
                  }}
                >
                  {renderCaptionTokens(page, "subtitle")}
                </div>
              </AbsoluteFill>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  return null;
};
