import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const SampleVideo: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(
    frame,
    [0, durationInFrames * 0.4],
    [24, 0],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black", color: "white" }}>
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            fontSize: 64,
            fontWeight: 600,
            opacity,
            transform: `translateY(${translateY}px)`,
          }}
        >
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  );
};
