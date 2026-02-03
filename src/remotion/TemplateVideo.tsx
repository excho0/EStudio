"use client";

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TemplateVideoProps } from "@/types";

export type { TemplateVideoProps } from "@/types";

export const TemplateVideo: React.FC<TemplateVideoProps> = ({
  title,
  subtitle,
  badge,
  accentColor,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 24], [30, 0], {
    extrapolateRight: "clamp",
  });

  const glow = interpolate(frame, [0, durationInFrames * 0.5], [0.35, 0.7], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: backgroundColor,
        color: "#f8fafc",
        fontFamily: "var(--font-geist-sans)",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.18), transparent 55%), radial-gradient(circle at 80% 10%, rgba(56,189,248,0.2), transparent 50%)",
          opacity: 0.9,
        }}
      />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              height: 10,
              width: 10,
              borderRadius: "999px",
              background: accentColor,
              boxShadow: `0 0 18px ${accentColor}`,
            }}
          />
          <span style={{ fontSize: 18, letterSpacing: "0.25em" }}>
            {badge}
          </span>
        </div>

        <div style={{ maxWidth: 900 }}>
          <div
            style={{
              opacity: fadeIn,
              transform: `translateY(${rise}px)`,
            }}
          >
            <h1
              style={{
                fontSize: 72,
                fontWeight: 700,
                marginBottom: 18,
                lineHeight: 1.05,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontSize: 28,
                color: "rgba(248,250,252,0.7)",
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          </div>
        </div>

        <Sequence from={18} durationInFrames={durationInFrames - 18}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              opacity: fadeIn,
            }}
          >
            <div
              style={{
                padding: "16px 24px",
                borderRadius: 999,
                background: "rgba(15,23,42,0.75)",
                border: "1px solid rgba(148,163,184,0.25)",
                fontSize: 18,
                letterSpacing: "0.12em",
              }}
            >
              LOOP READY
            </div>
            <div
              style={{
                height: 120,
                width: 120,
                borderRadius: "24px",
                border: `2px solid ${accentColor}`,
                boxShadow: `0 0 40px rgba(16,185,129,${glow})`,
                background: "rgba(15,23,42,0.6)",
              }}
            />
          </div>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
