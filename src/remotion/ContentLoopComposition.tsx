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
  videoDurationSeconds,
  playbackRate = 1,
  overlapRatio = null,
}) => {
  const frame = useCurrentFrame();
  const { isRendering } = useRemotionEnvironment();
  const { durationInFrames, fps } = useVideoConfig();
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [fadeStartFrame, setFadeStartFrame] = useState<number | null>(null);
  const thumbnailRenderHandle = useRef<number | null>(null);
  const thumbnailFadeFrames = Math.min(12, Math.max(2, Math.round(fps * 0.2)));
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
  const videoOpacity = thumbnailSrc && !thumbnailLoaded ? 0 : 1;
  const resolvedPlaybackRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const segmentFrames = Math.max(1, Math.round(segmentDurationSeconds * fps));
  const fadeFrames = Math.max(0, Math.round(fadeDurationSeconds * fps));
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
      resolvedOverlapRatio,
    ]
  );

  useEffect(() => {
    if (!thumbnailSrc || isRendering) {
      return;
    }
    setThumbnailLoaded(false);
    setFadeStartFrame(null);
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
                  setThumbnailLoaded(true);
                  if (fadeStartFrame === null) {
                    setFadeStartFrame(frame);
                  }
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
      {audioSrc ? <Html5Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};
