import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Html5Audio } from "remotion";

export type AudioOnlyProps = {
  audioSrc: string;
  audioFadeInSeconds?: number;
  audioFadeOutSeconds?: number;
  audioFadeInOffsetSeconds?: number;
  audioFadeOutOffsetSeconds?: number;
  songDurationSeconds?: number;
  fps?: number;
};

export const AudioOnlyComposition: React.FC<AudioOnlyProps> = ({
  audioSrc,
  audioFadeInSeconds = 0,
  audioFadeOutSeconds = 0,
  audioFadeInOffsetSeconds = 0,
  audioFadeOutOffsetSeconds = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const audioFadeInFrames = Math.max(0, Math.round(audioFadeInSeconds * fps));
  const audioFadeOutFrames = Math.max(0, Math.round(audioFadeOutSeconds * fps));
  const audioFadeInOffsetFrames = Math.max(
    0,
    Math.round(audioFadeInOffsetSeconds * fps)
  );
  const audioFadeOutOffsetFrames = Math.max(
    0,
    Math.round(audioFadeOutOffsetSeconds * fps)
  );
  const audioFadeInStart = audioFadeInOffsetFrames;
  const audioFadeOutEnd = Math.max(0, durationInFrames - audioFadeOutOffsetFrames);

  const fadeInProgress =
    audioFadeInFrames > 0
      ? Math.min(1, Math.max(0, (frame - audioFadeInStart) / audioFadeInFrames))
      : 1;
  const fadeOutProgress =
    audioFadeOutFrames > 0
      ? Math.min(1, Math.max(0, (audioFadeOutEnd - frame) / audioFadeOutFrames))
      : 1;

  return (
    <AbsoluteFill>
      {audioSrc ? <Html5Audio src={audioSrc} volume={fadeInProgress * fadeOutProgress} /> : null}
    </AbsoluteFill>
  );
};
