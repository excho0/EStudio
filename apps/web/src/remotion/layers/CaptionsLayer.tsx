import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { hexToRgba, type CaptionPage } from "../utils";

type CaptionsLayerProps = {
  captionsEnabled: boolean;
  captionsStyle: "subtitle" | "tiktok";
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
                  justifyContent: "flex-end",
                  alignItems: "center",
                  padding: "0 28px 98px",
                }}
              >
                <div
                  style={{
                    maxWidth: "88%",
                    fontSize: 42,
                    fontWeight: 900,
                    lineHeight: 1.12,
                    letterSpacing: 0.2,
                    textAlign: "center",
                    textTransform: "uppercase",
                    color: "#FFFFFF",
                    textShadow:
                      "0 2px 8px rgba(0,0,0,0.82), 0 0 20px rgba(0,0,0,0.55), 0 0 24px rgba(255,255,255,0.1)",
                    WebkitTextStroke: "0.8px rgba(0,0,0,0.5)",
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
                  justifyContent: "flex-end",
                  alignItems: "center",
                  padding: captionsStyle === "tiktok" ? "0 24px 84px" : "0 24px 64px",
                }}
              >
                <div
                  style={{
                    maxWidth: "86%",
                    fontSize: 40,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    textAlign: "center",
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
