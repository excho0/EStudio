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
import { useAudioData } from "@remotion/media-utils";
import { getAudioSpectrum } from "../lib/audio/fft";
import { getLogBands } from "../lib/audio/bands";
import { processAudioBars } from "../lib/audio/processing";

export type ContentLoopProps = {
  title: string;
  thumbnailSrc?: string;
  videoSrc: string;
  audioSrc: string;
  colorPalette?: string[];
  scalePercent?: number;
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
  style?: React.CSSProperties;
};

const DEFAULT_PALETTE = ["#7CC2FF", "#4F86FF", "#4E56FF"];

const normalizeHex = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9A-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return null;
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return `rgba(124,194,255,${alpha})`;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  scale: number;
}> = ({ duration, videoSrc, videoFrames, startFrom, playbackRate, scale }) => {
  const slices = buildVideoSlices(startFrom, duration, videoFrames);

  return (
    <AbsoluteFill
      style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
    >
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
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
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
  colorPalette,
  scalePercent = 100,
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
  const visualizationOpacity =
    thumbnailSrc && !isRendering
      ? Math.max(0, Math.min(1, 1 - thumbnailOpacity))
      : 1;
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
  const scaleFactor = Math.min(2, Math.max(0, scalePercent / 100));
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
  const audioData = useAudioData(audioSrc ?? "");
  const fftSize = 2048;
  const spectrum = useMemo(() => {
    if (!audioData) return null;
    const frames = [frame - 2, frame - 1, frame];
    const weights = [0.2, 0.3, 0.5];
    const spectra = frames.map((currentFrame) =>
      getAudioSpectrum({
        audioData,
        frame: currentFrame,
        fps,
        fftSize,
        dataOffsetInSeconds: -0.015,
      })
    );
    const length = spectra[1]?.length ?? 0;
    const averaged = new Array(length).fill(0);
    for (let i = 0; i < length; i += 1) {
      let sum = 0;
      for (let j = 0; j < spectra.length; j += 1) {
        sum += (spectra[j][i] ?? 0) * weights[j];
      }
      averaged[i] = sum;
    }
    return averaged;
  }, [audioData, frame, fps]);
  const audioVisualization = useMemo(() => {
    if (!spectrum || !audioData) return null;
    return getLogBands({
      magnitudes: spectrum,
      sampleRate: audioData.sampleRate,
      fftSize,
      bands: 96,
      minFreq: 60,
      maxFreq: 20000,
    });
  }, [audioData, spectrum]);
  const audioBars = useMemo(() => {
    if (!audioVisualization) return null;
    return audioVisualization.map((value, index) => {
      const bandT = index / (audioVisualization.length - 1);
      const lowAtten = 0.6 + bandT * 0.8;
      const tilt = 0.85 + bandT * 0.6;
      return value * lowAtten * tilt;
    });
  }, [audioVisualization]);
  const paletteColors = useMemo(() => {
    if (!colorPalette?.length) return DEFAULT_PALETTE;
    const cleaned = colorPalette
      .map((value) => normalizeHex(value))
      .filter((value): value is string => Boolean(value));
    const base = cleaned.length ? cleaned : DEFAULT_PALETTE;
    return base.slice(0, 2);
  }, [colorPalette]);
  const accentColor =
    paletteColors.length > 0 ? paletteColors[0] : DEFAULT_PALETTE[0];
  const enableSoftGate = false;
  const smoothBars = useMemo(() => {
    const { next } = processAudioBars(audioBars, { enableSoftGate });
    return next.length ? next : null;
  }, [audioBars, enableSoftGate]);
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
              scale={scaleFactor}
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
      scaleFactor,
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
            <AbsoluteFill
              style={{
                opacity: thumbnailOpacity,
              }}
            >
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
      {smoothBars ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            // padding: "0 5px 5px", // original
            padding: "0",
            opacity: visualizationOpacity,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${smoothBars.length}, minmax(0, 1fr))`,
              gap: 4,
              alignItems: "end",
              height: 80,
              width: "100%",
              padding: "0 6px 0",
              background: "transparent",
            }}
          >
            {smoothBars.map((value, index) => {
              const barIndex =
                index < smoothBars.length / 2
                  ? index
                  : smoothBars.length - 1 - index;
              const lowBoost = Math.max(
                1,
                1.8 - barIndex / (smoothBars.length / 2)
              );
              const boosted = Math.pow(value * 2.2 * lowBoost, 1.05);
              const shimmer =
                1 +
                Math.sin((frame + index) * 0.15) *
                  0.015 *
                  (0.2 + value);
              const minVisible =
                0.13 +
                (1 -
                  barIndex / Math.max(1, smoothBars.length / 2)) *
                  0.02;
              const clamped = Math.max(minVisible, boosted * shimmer);
              const shade = paletteColors[index % paletteColors.length];
              return (
                <div
                  key={`bar-${index}`}
                  style={{
                    height: `${clamped * 160}%`,
                    borderRadius: 5,
                    background: `linear-gradient(180deg, ${hexToRgba(
                      shade,
                      0.95
                    )} 0%, ${hexToRgba(shade, 0.35)} 100%)`,
                    // border: `1px solid ${hexToRgba(accentColor, 0.35)}`,
                    boxShadow: `inset 0 1px 0 ${hexToRgba(
                      accentColor,
                      0.6
                    )}, 0 0 6px ${hexToRgba(accentColor, 0.3)}`,
                    opacity: 0.95,
                    transformOrigin: "center bottom",
                    // backdropFilter: "blur(2px)",
                  }}
                />
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}
      {outroOverlayOpacity > 0 ? (
        <AbsoluteFill
          style={{ backgroundColor: "black", opacity: outroOverlayOpacity }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
