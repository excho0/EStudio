import React from "react";
import { AbsoluteFill, Sequence, useRemotionEnvironment } from "remotion";
import { hexToRgba, type CaptionPage } from "../utils";

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
                    maxWidth: "88%",
                    fontSize: 42 * captionScale,
                    fontWeight: 900,
                    lineHeight: 1.12,
                    letterSpacing: 0.2,
                    fontFamily: CAPTION_FONT_STACK,
                    textAlign: baseLayoutStyle.textAlign,
                    textTransform: "capitalize",
                    color: "#FFFFFF",
                    textShadow: "0 2px 8px rgba(0,0,0,0.82), 0 0 20px rgba(0,0,0,0.55), 0 0 24px rgba(255,255,255,0.1)",
                    WebkitTextStroke: "0.3px rgba(0,0,0,0.5)",
                    opacity: effectiveCaptionOpacity,
                    transform: captionTransform,
                    filter: `blur(${captionBlur.toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {page.tokens.map((token, tokenIndex) => {
                    const isActive = token.fromMs <= timelineMs && token.toMs > timelineMs;
                    return (
                      <span
                        key={`${token.fromMs}-${token.toMs}-${token.text}`}
                        style={{
                          color: isActive ? captionHighlightColor : "#FFFFFF",
                          textShadow: isActive
                            ? `0 0 12px ${hexToRgba(captionHighlightColor, 0.85)}, 0 2px 8px rgba(0,0,0,0.82)`
                            : "0 2px 6px rgba(0,0,0,0.82)",
                          transition: "color 90ms linear",
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

  if (effectiveCaptionsStyle !== "tiktok" && captionPages.length > 0) {
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
                    fontWeight: 700,
                    lineHeight: 1.2,
                    fontFamily: CAPTION_FONT_STACK,
                    textAlign: baseLayoutStyle.textAlign,
                    color: "#FFFFFF",
                    background:
                      "linear-gradient(180deg, rgba(18,22,32,0.68) 0%, rgba(8,10,16,0.56) 100%)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 14,
                    padding: "12px 20px",
                    textShadow: "0 2px 8px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.35)",
                    backdropFilter: "blur(5px)",
                    boxShadow:
                      "0 14px 38px rgba(0,0,0,0.36), inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 24px rgba(255,255,255,0.08)",
                    opacity: effectiveCaptionOpacity,
                    transform: captionTransform,
                    filter: `blur(${captionBlur.toFixed(2)}px)`,
                    willChange: "transform, opacity, filter",
                  }}
                >
                  {page.tokens.map((token, tokenIndex) => {
                    const isActive = token.fromMs <= timelineMs && token.toMs > timelineMs;
                    return (
                      <span
                        key={`${token.fromMs}-${token.toMs}-${token.text}`}
                        style={{
                          color: isActive ? captionHighlightColor : "#FFFFFF",
                          textShadow: isActive
                            ? `0 0 12px ${hexToRgba(captionHighlightColor, 0.85)}, 0 2px 8px rgba(0,0,0,0.82)`
                            : "0 2px 8px rgba(0,0,0,0.82)",
                          transition: "color 90ms linear",
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
