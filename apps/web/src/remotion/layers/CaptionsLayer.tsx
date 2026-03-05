import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { hexToRgba, mixHex, type CaptionPage } from "../utils";

const CAPTION_FONT_STACK =
  "Inter, Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type CaptionsLayerProps = {
  captionsEnabled: boolean;
  captionsStyle: "subtitle" | "tiktok";
  captionsPosition: "top" | "center" | "bottom" | "custom";
  captionsOffsetX: number;
  captionsOffsetY: number;
  captionsScalePercent: number;
  effectiveCaptionsStyle: "subtitle" | "tiktok";
  captionPages: CaptionPage[];
  hasActiveCaption: boolean;
  fps: number;
  timelineMs: number;
  captionOpacity: number;
  captionTransform: string;
  captionBlur: number;
  captionHighlightColor: string;
  layerOpacity: number;
};

const easeInOutSine01 = (value: number) => 0.5 - 0.5 * Math.cos(Math.PI * value);

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

export const CaptionsLayer: React.FC<CaptionsLayerProps> = ({
  captionsEnabled,
  captionsStyle,
  captionsPosition,
  captionsOffsetX,
  captionsOffsetY,
  captionsScalePercent,
  effectiveCaptionsStyle,
  captionPages,
  hasActiveCaption,
  fps,
  timelineMs,
  captionOpacity,
  captionTransform,
  captionBlur,
  captionHighlightColor,
  layerOpacity,
}) => {
  if (!captionsEnabled || !hasActiveCaption) {
    return null;
  }

  const effectiveCaptionOpacity = captionOpacity * layerOpacity;
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

  if (effectiveCaptionsStyle === "tiktok" && captionPages.length > 0) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none", zIndex: 30 }}>
        {captionPages.map((page, index) => {
          const nextPage = captionPages[index + 1] ?? null;
          const startFrame = Math.floor((page.startMs / 1000) * fps);
          const endFrame = Math.max(
            startFrame + 1,
            nextPage
              ? Math.floor((nextPage.startMs / 1000) * fps)
              : Math.ceil(((page.startMs + page.durationMs) / 1000) * fps)
          );
          const durationInFrames = Math.max(1, endFrame - startFrame);
          if (durationInFrames <= 0) return null;
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
                }}
              >
                <div
                  style={{
                    fontSize: 42 * captionScale,
                    fontWeight: 900,
                    lineHeight: 1.12,
                    letterSpacing: 0.2,
                    fontFamily: CAPTION_FONT_STACK,
                    fontSynthesis: "none",
                    textAlign: baseLayoutStyle.textAlign,
                    textTransform: "capitalize",
                    textShadow: "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.9)",
                    opacity: effectiveCaptionOpacity,
                    transform: captionTransform,
                    filter: `blur(${captionBlur.toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {page.tokens.map((token, tokenIndex) => {
                    const highlightStrength = getTokenHighlightStrength(
                      token.fromMs,
                      token.toMs,
                      timelineMs
                    );
                    const tokenColor = mixHex(
                      "#FFFFFF",
                      captionHighlightColor,
                      highlightStrength
                    );
                    const glowAlpha = 0.15 + highlightStrength * 0.22;
                    const glowRadius = 1.4 + highlightStrength * 1.8;
                    return (
                      <span
                        key={`${token.fromMs}-${token.toMs}-${token.text}`}
                        style={{
                          color: tokenColor,
                          textShadow:
                            highlightStrength > 0.001
                              ? `0 0 ${glowRadius.toFixed(1)}px ${hexToRgba(
                                  captionHighlightColor,
                                  glowAlpha
                                )}, 0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)`
                              : "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)",
                        }}
                      >
                        {token.text}
                        {tokenIndex < page.tokens.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
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
      <AbsoluteFill style={{ pointerEvents: "none", zIndex: 30 }}>
        {captionPages.map((page, index) => {
          const nextPage = captionPages[index + 1] ?? null;
          const startFrame = Math.floor((page.startMs / 1000) * fps);
          const endFrame = Math.max(
            startFrame + 1,
            nextPage
              ? Math.floor((nextPage.startMs / 1000) * fps)
              : Math.ceil(((page.startMs + page.durationMs) / 1000) * fps)
          );
          const durationInFrames = Math.max(1, endFrame - startFrame);
          if (durationInFrames <= 0) return null;
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
                }}
              >
                <div
                  style={{
                    maxWidth: "86%",
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
                    opacity: effectiveCaptionOpacity,
                    transform: captionTransform,
                    filter: `blur(${captionBlur.toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                  }}
                >
                  {page.tokens.map((token, tokenIndex) => {
                    const highlightStrength = getTokenHighlightStrength(
                      token.fromMs,
                      token.toMs,
                      timelineMs
                    );
                    const tokenColor = mixHex(
                      "#FFFFFF",
                      captionHighlightColor,
                      highlightStrength
                    );
                    const glowAlpha = 0.14 + highlightStrength * 0.2;
                    const glowRadius = 1.2 + highlightStrength * 1.6;
                    return (
                      <span
                        key={`${token.fromMs}-${token.toMs}-${token.text}`}
                        style={{
                          color: tokenColor,
                          textShadow:
                            highlightStrength > 0.001
                              ? `0 0 ${glowRadius.toFixed(1)}px ${hexToRgba(
                                  captionHighlightColor,
                                  glowAlpha
                                )}, 0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)`
                              : "0 2px 0 rgba(0,0,0,0.74), 0 0 1px rgba(0,0,0,0.88)",
                        }}
                      >
                        {token.text}
                        {tokenIndex < page.tokens.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
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
