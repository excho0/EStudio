import { useMemo } from "react";
import { interpolate } from "remotion";
import { clamp } from "@estudio/utils";

type UseCompositionTimingArgs = {
  frame: number;
  fps: number;
  durationInFrames: number;
  introFadeSeconds: number;
  outroFadeSeconds: number;
  audioFadeInSeconds: number;
  audioFadeOutSeconds: number;
  audioFadeInOffsetSeconds: number;
  audioFadeOutOffsetSeconds: number;
  playbackRate: number;
  scalePercent: number;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  overlapRatio: number | null;
  videoDurationSeconds?: number | null;
  songDurationSeconds?: number | null;
  songRangeStartSeconds: number;
  songRangeEndSeconds: number | null;
  thumbnailRevealOpacity: number;
  videoVisibilityMultiplier: number;
};

export const useCompositionTiming = ({
  frame,
  fps,
  durationInFrames,
  introFadeSeconds,
  outroFadeSeconds,
  audioFadeInSeconds,
  audioFadeOutSeconds,
  audioFadeInOffsetSeconds,
  audioFadeOutOffsetSeconds,
  playbackRate,
  scalePercent,
  segmentDurationSeconds,
  fadeDurationSeconds,
  overlapRatio,
  videoDurationSeconds,
  songDurationSeconds,
  songRangeStartSeconds,
  songRangeEndSeconds,
  thumbnailRevealOpacity,
  videoVisibilityMultiplier,
}: UseCompositionTimingArgs) => {
  const introFadeFrames = Math.max(0, Math.round(introFadeSeconds * fps));
  const outroFadeFrames = Math.max(0, Math.round(outroFadeSeconds * fps));
  const videoFadeInOpacity =
    introFadeFrames > 0
      ? interpolate(frame, [0, introFadeFrames], [0, 1], {
          extrapolateRight: "clamp",
        })
      : 1;
  const videoFadeOutOpacity =
    outroFadeFrames > 0
      ? interpolate(
          frame,
          [Math.max(0, durationInFrames - outroFadeFrames), durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp" }
        )
      : 1;
  const introOutroOpacity = videoFadeInOpacity * videoFadeOutOpacity;
  const videoOpacity = videoVisibilityMultiplier * introOutroOpacity;
  const contentLayerOpacity = thumbnailRevealOpacity * introOutroOpacity;
  const outroOverlayOpacity =
    outroFadeFrames > 0
      ? interpolate(
          frame,
          [Math.max(0, durationInFrames - outroFadeFrames), durationInFrames],
          [0, 1],
          { extrapolateLeft: "clamp" }
        )
      : 0;

  const resolvedPlaybackRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const scaleFactor = Math.min(2, Math.max(0, scalePercent / 100));
  const segmentFrames = Math.max(1, Math.round(segmentDurationSeconds * fps));
  const fadeFrames = Math.max(0, Math.round(fadeDurationSeconds * fps));
  const audioFadeInFrames = Math.max(0, Math.round(audioFadeInSeconds * fps));
  const audioFadeOutFrames = Math.max(0, Math.round(audioFadeOutSeconds * fps));
  const audioFadeInOffsetFrames = Math.max(0, Math.round(audioFadeInOffsetSeconds * fps));
  const audioFadeOutOffsetFrames = Math.max(0, Math.round(audioFadeOutOffsetSeconds * fps));
  const clampedOverlapRatio =
    Number.isFinite(overlapRatio) && overlapRatio !== null
      ? Math.min(0.9, Math.max(0, overlapRatio))
      : null;
  const sourceVideoFrames = Math.max(
    1,
    Math.round((videoDurationSeconds ?? segmentDurationSeconds) * fps)
  );
  const songTotalFrames = Math.max(
    1,
    Math.round(Math.max(0, songDurationSeconds ?? durationInFrames / fps) * fps)
  );
  const rangeStartFrames = clamp(
    Math.round(Math.max(0, songRangeStartSeconds) * fps),
    0,
    songTotalFrames - 1
  );
  const rawRangeEndFrames =
    songRangeEndSeconds === null
      ? songTotalFrames
      : Math.round(Math.max(0, songRangeEndSeconds) * fps);
  const rangeEndFrames = clamp(rawRangeEndFrames, rangeStartFrames + 1, songTotalFrames);
  const playableVideoFrames = sourceVideoFrames;
  const defaultOverlapFrames =
    fadeFrames > 0 && segmentFrames > 1 ? Math.min(fadeFrames, segmentFrames - 1) : 0;
  const segmentStepFrames =
    clampedOverlapRatio === null
      ? Math.max(1, segmentFrames - defaultOverlapFrames)
      : Math.max(1, Math.round(segmentFrames * (1 - clampedOverlapRatio)));
  const overlapFrames = Math.max(0, segmentFrames - segmentStepFrames);
  const transitionFrames =
    fadeFrames > 0 && segmentFrames > 1 && overlapFrames > 0
      ? Math.min(fadeFrames, overlapFrames)
      : 0;
  const audioFadeInStart = audioFadeInOffsetFrames;
  const audioFadeInEnd = audioFadeInStart + audioFadeInFrames;
  const audioFadeOutEnd = Math.max(0, durationInFrames - audioFadeOutOffsetFrames);
  const audioFadeOutStart = Math.max(0, audioFadeOutEnd - audioFadeOutFrames);
  const audioFadeInOpacity =
    audioFadeInFrames > 0
      ? interpolate(frame, [audioFadeInStart, audioFadeInEnd], [0, 1], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        })
      : 1;
  const audioFadeOutOpacity =
    audioFadeOutFrames > 0
      ? interpolate(frame, [audioFadeOutStart, audioFadeOutEnd], [1, 0], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        })
      : 1;
  const audioVolume = Math.max(0, Math.min(1, audioFadeInOpacity * audioFadeOutOpacity));
  const maxSegmentStartFrame = Math.max(0, playableVideoFrames - segmentFrames);
  const timelineMs = (frame / fps) * 1000;

  return useMemo(
    () => ({
      introFadeFrames,
      outroFadeFrames,
      videoOpacity,
      contentLayerOpacity,
      outroOverlayOpacity,
      resolvedPlaybackRate,
      scaleFactor,
      segmentFrames,
      fadeFrames,
      audioFadeInFrames,
      audioFadeOutFrames,
      audioFadeInOffsetFrames,
      audioFadeOutOffsetFrames,
      sourceVideoFrames,
      songTotalFrames,
      rangeStartFrames,
      rangeEndFrames,
      playableVideoFrames,
      defaultOverlapFrames,
      segmentStepFrames,
      overlapFrames,
      transitionFrames,
      audioFadeInStart,
      audioFadeInEnd,
      audioFadeOutEnd,
      audioFadeOutStart,
      audioVolume,
      maxSegmentStartFrame,
      timelineMs,
    }),
    [
      audioFadeInEnd,
      audioFadeInFrames,
      audioFadeInOffsetFrames,
      audioFadeInStart,
      audioFadeOutEnd,
      audioFadeOutFrames,
      audioFadeOutOffsetFrames,
      audioFadeOutStart,
      audioVolume,
      contentLayerOpacity,
      defaultOverlapFrames,
      fadeFrames,
      introFadeFrames,
      maxSegmentStartFrame,
      outroFadeFrames,
      outroOverlayOpacity,
      overlapFrames,
      playableVideoFrames,
      rangeEndFrames,
      rangeStartFrames,
      resolvedPlaybackRate,
      scaleFactor,
      segmentFrames,
      segmentStepFrames,
      songTotalFrames,
      sourceVideoFrames,
      timelineMs,
      transitionFrames,
      videoOpacity,
    ]
  );
};
