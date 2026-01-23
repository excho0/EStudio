import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Html5Audio,
  Html5Video,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export type ContentLoopProps = {
  title: string;
  thumbnailSrc?: string;
  videoSrc: string;
  audioSrc: string;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  introFadeSeconds?: number;
  outroFadeSeconds?: number;
  audioFadeInSeconds?: number;
  audioFadeOutSeconds?: number;
  audioFadeInOffsetSeconds?: number;
  audioFadeOutOffsetSeconds?: number;
  videoDurationSeconds?: number;
  playbackRate?: number;
  overlapRatio?: number | null;
  songDurationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
};

type VideoSlice = {
  from: number;
  startFrom: number;
  duration: number;
};

type LoopVideoProps = {
  src: string;
  startFrom?: number;
  endAt?: number;
  muted?: boolean;
  playbackRate?: number;
};

const LoopVideo: React.FC<LoopVideoProps> = (props) => {
  const { isRendering } = useRemotionEnvironment();

  if (isRendering) {
    return <OffthreadVideo {...props} />;
  }

  return <Html5Video {...props} />;
};

const buildVideoSlices = (
  startFrom: number,
  duration: number,
  videoFrames: number
) => {
  const slices: VideoSlice[] = [];
  let remaining = duration;
  let currentStart = startFrom;
  let offset = 0;

  while (remaining > 0) {
    if (currentStart >= videoFrames) {
      currentStart = 0;
    }
    const available = Math.max(0, videoFrames - currentStart);
    const sliceDuration = Math.min(remaining, available || remaining);
    slices.push({ from: offset, startFrom: currentStart, duration: sliceDuration });
    remaining -= sliceDuration;
    offset += sliceDuration;
    currentStart = 0;

    if (slices.length > 1000) {
      break;
    }
  }

  return slices;
};

const SegmentLayer: React.FC<{
  duration: number;
  videoSrc: string;
  videoFrames: number;
  startFrom: number;
  playbackRate?: number;
}> = ({ duration, videoSrc, videoFrames, startFrom, playbackRate }) => {
  const slices = buildVideoSlices(startFrom, duration, videoFrames);

  return (
    <AbsoluteFill>
      {slices.map((slice) => (
        <Sequence
          key={`${slice.from}-${slice.startFrom}`}
          from={slice.from}
          durationInFrames={slice.duration}
        >
          <LoopVideo
            src={videoSrc}
            startFrom={slice.startFrom}
            endAt={slice.startFrom + slice.duration}
            muted
            playbackRate={playbackRate}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const ContentLoopComposition: React.FC<ContentLoopProps> = ({
  thumbnailSrc,
  videoSrc,
  audioSrc,
  segmentDurationSeconds,
  fadeDurationSeconds,
  introFadeSeconds = 0,
  outroFadeSeconds = 0,
  audioFadeInSeconds = 0,
  audioFadeOutSeconds = 0,
  audioFadeInOffsetSeconds = 0,
  audioFadeOutOffsetSeconds = 0,
  videoDurationSeconds,
  playbackRate = 1,
  overlapRatio = null,
}) => {
  const frame = useCurrentFrame();
  const { isRendering } = useRemotionEnvironment();
  const { durationInFrames, fps } = useVideoConfig();
  const [loadedThumbnailSrc, setLoadedThumbnailSrc] = useState<string | null>(null);
  const [fadeStartState, setFadeStartState] = useState<{
    src: string | null;
    frame: number | null;
  }>({ src: null, frame: null });
  const thumbnailRenderHandle = useRef<number | null>(null);
  const thumbnailFadeFrames = Math.min(12, Math.max(2, Math.round(fps * 0.2)));
  const thumbnailLoaded = Boolean(thumbnailSrc && loadedThumbnailSrc === thumbnailSrc);
  const fadeStartFrame =
    thumbnailSrc && fadeStartState.src === thumbnailSrc ? fadeStartState.frame : null;
  const fadeFrom = fadeStartFrame ?? 0;
  const fadeOutEnd = fadeFrom + thumbnailFadeFrames;
  const shouldFade = thumbnailSrc && thumbnailLoaded && fadeStartFrame !== null;
  const thumbnailOpacity =
    shouldFade && thumbnailSrc
      ? interpolate(frame, [fadeFrom, fadeOutEnd], [1, 0], {
          extrapolateRight: "clamp",
        })
      : thumbnailSrc
        ? 1
        : 0;
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
  const videoOpacity =
    (thumbnailSrc && !thumbnailLoaded && !isRendering ? 0 : 1) *
    introOutroOpacity;
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
  const segmentFrames = Math.max(1, Math.round(segmentDurationSeconds * fps));
  const fadeFrames = Math.max(0, Math.round(fadeDurationSeconds * fps));
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
  const resolvedOverlapRatio =
    Number.isFinite(overlapRatio) && overlapRatio !== null
      ? Math.min(0.9, Math.max(0, overlapRatio))
      : null;
  const videoFrames = Math.max(
    1,
    Math.round((videoDurationSeconds ?? segmentDurationSeconds) * fps)
  );
  const defaultOverlapFrames =
    fadeFrames > 0 && segmentFrames > 1
      ? Math.min(fadeFrames, segmentFrames - 1)
      : 0;
  const step =
    resolvedOverlapRatio === null
      ? Math.max(1, segmentFrames - defaultOverlapFrames)
      : Math.max(1, Math.round(segmentFrames * (1 - resolvedOverlapRatio)));
  const overlapFrames = Math.max(0, segmentFrames - step);
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
  const audioVolume = Math.max(
    0,
    Math.min(1, audioFadeInOpacity * audioFadeOutOpacity)
  );
  const maxStart = Math.max(0, videoFrames - segmentFrames);
  const segmentCount = useMemo(() => {
    if (segmentFrames <= transitionFrames) {
      return 1;
    }
    const target = Math.max(1, durationInFrames - transitionFrames);
    return Math.max(1, Math.ceil(target / step));
  }, [durationInFrames, segmentFrames, step, transitionFrames]);
  const segments = useMemo(
    () => Array.from({ length: segmentCount }, (_, index) => index),
    [segmentCount]
  );
  const series = useMemo(
    () =>
      segments.flatMap((index) => {
        const items = [
          <TransitionSeries.Sequence
            key={`segment-${index}`}
            durationInFrames={segmentFrames}
          >
            <SegmentLayer
              duration={segmentFrames}
              videoSrc={videoSrc}
              videoFrames={videoFrames}
              startFrom={
                maxStart === 0 ? 0 : (index * step) % (maxStart + 1)
              }
              playbackRate={resolvedPlaybackRate}
            />
          </TransitionSeries.Sequence>,
        ];

        if (index < segments.length - 1 && transitionFrames > 0) {
          items.push(
            <TransitionSeries.Transition
              key={`transition-${index}`}
              presentation={fade({
                shouldFadeOutExitingScene: false,
              })}
              timing={linearTiming({ durationInFrames: transitionFrames })}
            />
          );
        }

        return items;
      }),
    [
      segmentFrames,
      segments,
      step,
      transitionFrames,
      videoFrames,
      videoSrc,
      maxStart,
      resolvedPlaybackRate,
    ]
  );

  useEffect(() => {
    if (!thumbnailSrc || isRendering) {
      return;
    }
    if (thumbnailRenderHandle.current !== null) {
      continueRender(thumbnailRenderHandle.current);
    }
    thumbnailRenderHandle.current = delayRender("Loading thumbnail");
    return () => {
      if (thumbnailRenderHandle.current !== null) {
        continueRender(thumbnailRenderHandle.current);
        thumbnailRenderHandle.current = null;
      }
    };
  }, [thumbnailSrc, isRendering]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#050505", color: "white" }}>
      {videoSrc ? (
        <>
          <AbsoluteFill style={{ opacity: videoOpacity }}>
            <TransitionSeries>{series}</TransitionSeries>
          </AbsoluteFill>
          {thumbnailSrc && !isRendering ? (
            <AbsoluteFill style={{ opacity: thumbnailOpacity }}>
              <Img
                src={thumbnailSrc}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onLoad={() => {
                  setLoadedThumbnailSrc(thumbnailSrc);
                  setFadeStartState({ src: thumbnailSrc, frame });
                  if (thumbnailRenderHandle.current !== null) {
                    continueRender(thumbnailRenderHandle.current);
                    thumbnailRenderHandle.current = null;
                  }
                }}
                onError={() => {
                  if (thumbnailRenderHandle.current !== null) {
                    continueRender(thumbnailRenderHandle.current);
                    thumbnailRenderHandle.current = null;
                  }
                }}
              />
            </AbsoluteFill>
          ) : null}
        </>
      ) : (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            padding: 48,
          }}
        >
          Upload a video to preview the looped sequence.
        </AbsoluteFill>
      )}
      {audioSrc ? <Html5Audio src={audioSrc} volume={audioVolume} /> : null}
      {outroOverlayOpacity > 0 ? (
        <AbsoluteFill
          style={{ backgroundColor: "black", opacity: outroOverlayOpacity }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
