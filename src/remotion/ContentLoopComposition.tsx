import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  Video,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export type ContentLoopProps = {
  title: string;
  videoSrc: string;
  audioSrc: string;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  videoDurationSeconds?: number;
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
};

const LoopVideo: React.FC<LoopVideoProps> = (props) => {
  const { isRendering } = useRemotionEnvironment();

  if (isRendering) {
    return <OffthreadVideo {...props} />;
  }

  return <Video {...props} />;
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
}> = ({ duration, videoSrc, videoFrames, startFrom }) => {
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
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const ContentLoopComposition: React.FC<ContentLoopProps> = ({
  videoSrc,
  audioSrc,
  segmentDurationSeconds,
  fadeDurationSeconds,
  videoDurationSeconds,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const segmentFrames = Math.max(1, Math.round(segmentDurationSeconds * fps));
  const fadeFrames = Math.max(0, Math.round(fadeDurationSeconds * fps));
  const videoFrames = Math.max(
    1,
    Math.round((videoDurationSeconds ?? segmentDurationSeconds) * fps)
  );
  const transitionFrames =
    fadeFrames > 0 && segmentFrames > 1
      ? Math.min(fadeFrames, segmentFrames - 1)
      : 0;
  const step = Math.max(1, segmentFrames - transitionFrames);
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
            />
          </TransitionSeries.Sequence>,
        ];

        if (index < segments.length - 1 && transitionFrames > 0) {
          items.push(
            <TransitionSeries.Transition
              key={`transition-${index}`}
              presentation={fade({ shouldFadeOutExitingScene: true })}
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
    ]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#050505", color: "white" }}>
      {videoSrc ? (
        <TransitionSeries>{series}</TransitionSeries>
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
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};
