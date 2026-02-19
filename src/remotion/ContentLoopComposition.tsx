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
import type { ContentLoopProps } from "@/types";

export type { ContentLoopProps } from "@/types";

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

const mixHex = (first: string, second: string, amount: number) => {
  const a = normalizeHex(first);
  const b = normalizeHex(second);
  if (!a || !b) return first;
  const t = Math.max(0, Math.min(1, amount));
  const toLinear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (value: number) => {
    const c = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, c)) * 255);
  };
  const ar = toLinear(Number.parseInt(a.slice(1, 3), 16));
  const ag = toLinear(Number.parseInt(a.slice(3, 5), 16));
  const ab = toLinear(Number.parseInt(a.slice(5, 7), 16));
  const br = toLinear(Number.parseInt(b.slice(1, 3), 16));
  const bg = toLinear(Number.parseInt(b.slice(3, 5), 16));
  const bb = toLinear(Number.parseInt(b.slice(5, 7), 16));
  const r = toSrgb(ar + (br - ar) * t);
  const g = toSrgb(ag + (bg - ag) * t);
  const b2 = toSrgb(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
};

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  sharpenEnabled?: boolean;
  sharpenAmount?: number;
  sharpenUseMaster?: boolean;
  sharpenMaster?: number;
  sharpenContrastWeight?: number;
  sharpenSaturationWeight?: number;
  sharpenBrightnessWeight?: number;
  glowEnabled?: boolean;
  glowIntensity?: number;
  glowColor?: string;
  scale: number;
}> = ({
  duration,
  videoSrc,
  videoFrames,
  startFrom,
  playbackRate,
  sharpenEnabled = false,
  sharpenAmount = 0.4,
  sharpenUseMaster = true,
  sharpenMaster = 0.4,
  sharpenContrastWeight = 0.45,
  sharpenSaturationWeight = 0.2,
  sharpenBrightnessWeight = 0.03,
  glowEnabled = false,
  glowIntensity = 0,
  glowColor,
  scale,
}) => {
  const { width, height, fps } = useVideoConfig();
  const slices = buildVideoSlices(startFrom, duration, videoFrames);
  const masterStrength = Math.max(
    0,
    Math.min(1, Number.isFinite(sharpenMaster) ? sharpenMaster : sharpenAmount)
  );
  const contrastWeight = Math.max(0, Math.min(1, sharpenContrastWeight));
  const saturationWeight = Math.max(0, Math.min(1, sharpenSaturationWeight));
  const brightnessWeight = Math.max(0, Math.min(0.5, sharpenBrightnessWeight));
  const contrastBoost = sharpenUseMaster
    ? masterStrength * contrastWeight
    : contrastWeight;
  const saturationBoost = sharpenUseMaster
    ? masterStrength * saturationWeight
    : saturationWeight;
  const brightnessBoost = sharpenUseMaster
    ? masterStrength * brightnessWeight
    : brightnessWeight;
  const baseVideoFilter = sharpenEnabled
    ? `contrast(${(1 + contrastBoost).toFixed(3)}) saturate(${(
        1 + saturationBoost
      ).toFixed(3)}) brightness(${(1 + brightnessBoost).toFixed(3)})`
    : undefined;

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
              filter: baseVideoFilter,
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
  visualizationEnabled = true,
  visualizationBars = 128,
  edgeRaysEnabled = true,
  edgeRaysIntensity = 0.3,
  edgeRaysVocalBalance = 0.6,
  motionEnabled = false,
  motionAmountPx = 4,
  motionSpeed = 0.6,
  motionAttack = 0.9,
  motionRelease = 0.32,
  sharpenEnabled = false,
  sharpenAmount = 0.4,
  sharpenUseMaster = true,
  sharpenMaster = 0.4,
  sharpenContrastWeight = 0.45,
  sharpenSaturationWeight = 0.2,
  sharpenBrightnessWeight = 0.03,
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
  captionsEnabled = false,
  captionsStyle = "subtitle",
  captionsData = null,
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
  const resolvedVisualizationBars = Math.min(
    256,
    Math.max(16, Math.round(Number(visualizationBars) || 128))
  );

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

  const glowColor = useMemo(() => {
    const primary = paletteColors[0] ?? DEFAULT_PALETTE[0];
    const secondary = paletteColors[1] ?? primary;
    const blended = mixHex(primary, secondary, 0.5);
    return mixHex(blended, "#FFFFFF", 0.4);
  }, [paletteColors]);



  // FIX 2: Added `noiseFloor` parameter and made the `curve` slightly higher 
  // for a sharper AE look.
  const smoothBars = useMemo(() => {
    if (!visualizationEnabled && !edgeRaysEnabled) return null;
    if (!audioData) return null;

    // CONFIGURATION
    const LOOKBACK_FRAMES = 12;  // How far back we look for temporal smoothing
    const DECAY_FACTOR = 0.4;    // Controls the "Release" (Gravity)
    const INPUT_SMOOTHING = 4;   // Controls the "Attack" (removes jitter). 
    const SPATIAL_SMOOTHING = 1; // Smooth across neighboring bars
    const BANDS = resolvedVisualizationBars; // Fewer bands = less noise / more stability
                                 // Higher = less jitter, but punchiness is softer.

    // 1. Fetch a batch of raw history
    // We need extra frames to calculate the rolling average for the oldest lookback frame
    const totalFramesNeeded = LOOKBACK_FRAMES + INPUT_SMOOTHING;
    const range = Array.from({ length: totalFramesNeeded }, (_, i) => i);

    const rawHistory = range.map((offset) => {
      const targetFrame = frame - offset;
      
      const spectrum = getAudioSpectrum({
        audioData,
        frame: targetFrame,
        fps,
        fftSize,
      });

      const bands = getLogBands({
        magnitudes: spectrum,
        sampleRate: audioData.sampleRate,
        fftSize,
        bands: BANDS,
        minFreq: 60,
        maxFreq: 20000,
      });

      // Use our stateless processor
      const { next } = processAudioBars(bands, {
        maxOutput: 100,
        gain: 2.0,
        curve: 0.8, 
        noiseFloor: 0.04,
      });
      return next;
    });

    // 2. Average the history (Input Smoothing / "Attack")
    // This kills the jitter by saying "The value at T is actually the average of T, T-1, T-2"
    const smoothedHistory: number[][] = [];
    
    // We only need to compute smoothed values for the 'LOOKBACK' window
    for (let i = 0; i < LOOKBACK_FRAMES; i++) {
      const currentRaw = rawHistory[i];
      if (!currentRaw) {
        smoothedHistory.push([]);
        continue;
      }

      // Average this frame with its neighbors to remove FFT noise
      const smoothedFrame = currentRaw.map((val, barIdx) => {
        let sum = val;
        let count = 1;
        
        // Add previous frames to the average
        for (let j = 1; j < INPUT_SMOOTHING; j++) {
          const pastFrame = rawHistory[i + j];
          if (pastFrame) {
            sum += pastFrame[barIdx];
            count++;
          }
        }
        return sum / count;
      });
      
      smoothedHistory.push(smoothedFrame);
    }

    const currentSmoothedBars = smoothedHistory[0];
    if (!currentSmoothedBars) return null;

    // 3. Apply Decay Physics (Release) with weighted averaging (less jitter).
    const temporalBars = currentSmoothedBars.map((_, barIdx) => {
      let weightedSum = 0;
      let weightTotal = 0;
      for (let timeOffset = 0; timeOffset < smoothedHistory.length; timeOffset += 1) {
        const pastBars = smoothedHistory[timeOffset];
        if (!pastBars) continue;
        const weight = Math.pow(DECAY_FACTOR, timeOffset);
        weightedSum += pastBars[barIdx] * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : 0;
    });

    // 4. Spatial smoothing (across adjacent bars) to reduce "noisy" movement.
    const spatialBars = temporalBars.map((_, barIdx) => {
      let sum = 0;
      let count = 0;
      for (let offset = -SPATIAL_SMOOTHING; offset <= SPATIAL_SMOOTHING; offset += 1) {
        const idx = barIdx + offset;
        if (idx < 0 || idx >= temporalBars.length) continue;
        sum += temporalBars[idx];
        count += 1;
      }
      return count > 0 ? sum / count : 0;
    });

    return {
      bars: spatialBars,
      currentBars: currentSmoothedBars,
    };

  }, [
    audioData,
    edgeRaysEnabled,
    frame,
    fps,
    resolvedVisualizationBars,
    visualizationEnabled,
  ]);

  const edgeEnergy = useMemo(() => {
    if (!audioData) return 0;
    const currentBars = smoothBars?.currentBars;
    if (!currentBars || currentBars.length === 0) return 0;
    const total = currentBars.length;

    let sum = 0;
    for (let i = 0; i < total; i += 1) {
      sum += currentBars[i] ?? 0;
    }
    const avg = sum / total;

    const lowEnd = Math.max(1, Math.floor(total * 0.2));
    const vocalStart = Math.max(0, Math.floor(total * 0.25));
    const vocalEnd = Math.max(vocalStart + 1, Math.floor(total * 0.6));

    let lowSum = 0;
    for (let i = 0; i < lowEnd; i += 1) lowSum += currentBars[i] ?? 0;
    const lowAvg = lowSum / lowEnd;

    let vocalSum = 0;
    let vocalCount = 0;
    for (let i = vocalStart; i < vocalEnd && i < total; i += 1) {
      vocalSum += currentBars[i] ?? 0;
      vocalCount += 1;
    }
    const vocalAvg = vocalCount > 0 ? vocalSum / vocalCount : 0;

    const vocalWeight = Math.min(1, Math.max(0, edgeRaysVocalBalance));
    const lowWeight = 1 - vocalWeight;
    const base = lowAvg * lowWeight + vocalAvg * vocalWeight;
    const crest = Math.max(lowAvg, vocalAvg);

    const mixed = avg * 0.45 + base * 0.35 + crest * 0.2;
    const floor = 0.003;
    const normalized = Math.max(0, Math.min(1, (mixed - floor) / (1 - floor)));
    return Math.pow(normalized, 0.6);
  }, [audioData, edgeRaysVocalBalance, smoothBars]);

  const bassMotionEnergy = useMemo(() => {
    const currentBars = smoothBars?.currentBars;
    if (!currentBars || currentBars.length === 0) return 0;
    const total = currentBars.length;
    const bassEnd = Math.max(1, Math.floor(total * 0.14));
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i += 1) {
      bassSum += currentBars[i] ?? 0;
    }
    const bassAvg = bassSum / bassEnd;
    const normalized = Math.max(0, Math.min(1, (bassAvg - 0.006) / 0.35));
    return Math.pow(normalized, 0.7);
  }, [smoothBars]);

  const glowRef = useRef(0);
  const glowOutputRef = useRef(0);
  const lastEnergyRef = useRef(0);
  const transientRef = useRef(0);
  const gateRef = useRef(0);
  const glowIntensity = useMemo(() => {
    const intensityScale = 0.35 + edgeRaysIntensity * 1.35;
    const target = Math.min(1, edgeEnergy * intensityScale);
    if (frame === 0) {
      glowRef.current = target;
      glowOutputRef.current = target;
      lastEnergyRef.current = target;
      return target;
    }

    const lastEnergy = lastEnergyRef.current;
    const rise = Math.max(0, target - lastEnergy);
    lastEnergyRef.current = target;

    const transient = lerp(transientRef.current, rise, 0.26);
    transientRef.current = transient;

    const gateTarget = rise > 0.022 || target > 0.07 ? 1 : 0;
    const gate = gateTarget > gateRef.current
      ? lerp(gateRef.current, gateTarget, 0.38)
      : lerp(gateRef.current, gateTarget, 0.08);
    gateRef.current = gate;

    const current = glowRef.current;
    const attack = 0.62;
    const release = 0.14;
    const smoothed = target > current
      ? lerp(current, target, attack)
      : lerp(current, target, release);
    glowRef.current = smoothed;

    const kick = transient * 1.25 * gate;
    const combined = Math.min(1, smoothed + kick);
    const output = lerp(glowOutputRef.current, combined, 0.42);
    glowOutputRef.current = output;
    return output;
  }, [edgeEnergy, edgeRaysIntensity, frame]);

  const motionEnvelopeRef = useRef(0);
  const motionLastEnergyRef = useRef(0);
  const motionTransientRef = useRef(0);
  const motionKickRef = useRef(0);
  const motionEnergy = useMemo(() => {
    const target = Math.max(0, Math.min(1, bassMotionEnergy));
    if (frame === 0) {
      motionEnvelopeRef.current = target;
      motionLastEnergyRef.current = target;
      motionTransientRef.current = 0;
      motionKickRef.current = 0;
      return target;
    }
    const attack = Math.max(0.22, Math.min(0.995, motionAttack));
    const release = Math.max(0.06, Math.min(0.95, motionRelease));
    const current = motionEnvelopeRef.current;
    const smoothed =
      target > current
        ? lerp(current, target, attack)
        : lerp(current, target, release);
    motionEnvelopeRef.current = smoothed;

    const rise = Math.max(0, target - motionLastEnergyRef.current);
    motionLastEnergyRef.current = target;
    const transient = lerp(motionTransientRef.current, rise, 0.75);
    motionTransientRef.current = transient;
    const kickTarget = rise > 0.016 ? 1 : 0;
    const kick = lerp(motionKickRef.current, kickTarget, 0.78);
    motionKickRef.current = kick;
    return Math.min(1, smoothed * 0.78 + transient * 3.8 * kick);
  }, [bassMotionEnergy, frame, motionAttack, motionRelease]);

  const motionTime = (frame / fps) * Math.PI * 2 * Math.max(0, motionSpeed);
  const motionBase = Math.max(0, Math.min(1, motionEnergy * 1.55 + 0.08));
  const motionAmp = Math.max(0, motionAmountPx) * motionBase;
  const motionXRaw = motionEnabled ? Math.sin(motionTime) * motionAmp : 0;
  const motionYRaw = motionEnabled
    ? (Math.cos(motionTime * 0.9) * motionAmp * 0.45 + motionAmp * 0.25)
    : 0;
  const motionXRef = useRef(0);
  const motionYRef = useRef(0);
  const motionLerpAlpha = 0.22;
  const motionMaxStep = Math.max(0.5, motionAmountPx * 0.35);
  if (frame === 0) {
    motionXRef.current = motionXRaw;
    motionYRef.current = motionYRaw;
  } else {
    const nextX = lerp(motionXRef.current, motionXRaw, motionLerpAlpha);
    const nextY = lerp(motionYRef.current, motionYRaw, motionLerpAlpha);
    const dx = nextX - motionXRef.current;
    const dy = nextY - motionYRef.current;
    // Limit per-frame jump to avoid tiny jerk spikes in noisy music regions.
    motionXRef.current += clamp(dx, -motionMaxStep, motionMaxStep);
    motionYRef.current += clamp(dy, -motionMaxStep, motionMaxStep);
  }
  const motionX = motionXRef.current;
  const motionY = motionYRef.current;
  const motionTransform = motionEnabled
    ? `translate(${motionX.toFixed(2)}px, ${motionY.toFixed(2)}px)`
    : undefined;


  const maxStart = Math.max(0, videoFrames - segmentFrames);
  const activeCaption = useMemo(() => {
    if (!captionsEnabled || !captionsData?.segments?.length) {
      return null;
    }
    const timeMs = (frame / fps) * 1000;
    const segment = captionsData.segments.find(
      (item) => timeMs >= item.startMs && timeMs < item.endMs
    );
    return segment?.text?.trim() || null;
  }, [captionsData?.segments, captionsEnabled, fps, frame]);
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
              sharpenEnabled={sharpenEnabled}
              sharpenAmount={sharpenAmount}
              sharpenUseMaster={sharpenUseMaster}
              sharpenMaster={sharpenMaster}
              sharpenContrastWeight={sharpenContrastWeight}
              sharpenSaturationWeight={sharpenSaturationWeight}
              sharpenBrightnessWeight={sharpenBrightnessWeight}
              glowEnabled={edgeRaysEnabled}
              glowIntensity={glowIntensity * visualizationOpacity * introOutroOpacity}
              glowColor={glowColor}
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
      glowIntensity,
      sharpenAmount,
      sharpenUseMaster,
      sharpenMaster,
      sharpenContrastWeight,
      sharpenSaturationWeight,
      sharpenBrightnessWeight,
      sharpenEnabled,
      introOutroOpacity,
      visualizationOpacity,
      edgeRaysEnabled,
      glowColor,
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
          <AbsoluteFill
            style={{
              opacity: videoOpacity,
              transform: motionTransform,
            }}
          >
            <TransitionSeries>{series}</TransitionSeries>
          </AbsoluteFill>
          {thumbnailSrc && !isRendering ? (
            <AbsoluteFill
              style={{
                opacity: thumbnailOpacity,
                transform: motionTransform,
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
      {edgeRaysEnabled && glowIntensity > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            opacity: visualizationOpacity * introOutroOpacity,
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              mixBlendMode: "screen", // TODO: check normal  as well!!
            }}
          />
          {[
            {
              key: "top",
              style: {
                top: 0,
                left: 0,
                right: 0,
                height: 140,
                background: `linear-gradient(180deg, ${hexToRgba(
                  glowColor,
                  glowIntensity * 0.9
                )} 0%, ${hexToRgba(glowColor, 0)} 85%)`,
              },
            },
            {
              key: "bottom",
              style: {
                bottom: 0,
                left: 0,
                right: 0,
                height: 140,
                background: `linear-gradient(0deg, ${hexToRgba(
                  glowColor,
                  glowIntensity * 0.9
                )} 0%, ${hexToRgba(glowColor, 0)} 85%)`,
              },
            },
            {
              key: "left",
              style: {
                top: 0,
                bottom: 0,
                left: 0,
                width: 140,
                background: `linear-gradient(90deg, ${hexToRgba(
                  glowColor,
                  glowIntensity * 0.9
                )} 0%, ${hexToRgba(glowColor, 0)} 85%)`,
              },
            },
            {
              key: "right",
              style: {
                top: 0,
                bottom: 0,
                right: 0,
                width: 140,
                background: `linear-gradient(270deg, ${hexToRgba(
                  glowColor,
                  glowIntensity * 0.9
                )} 0%, ${hexToRgba(glowColor, 0)} 85%)`,
              },
            },
          ].map((edge) => (
            <div
              key={edge.key}
              style={{
                position: "absolute",
                filter: `blur(${110 + glowIntensity * 140}px)`,
                opacity: 1,
                ...edge.style,
              }}
            />
          ))}
        </AbsoluteFill>
      )}
      {audioSrc ? <Html5Audio src={audioSrc} volume={audioVolume} /> : null}
      {captionsEnabled && activeCaption ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: captionsStyle === "tiktok" ? "0 24px 84px" : "0 24px 64px",
            zIndex: 30,
          }}
        >
          <div
            style={
              captionsStyle === "tiktok"
                ? {
                    maxWidth: "92%",
                    fontSize: 54,
                    fontWeight: 900,
                    lineHeight: 1.06,
                    letterSpacing: 0.4,
                    textAlign: "center",
                    textTransform: "uppercase",
                    color: "#FFFFFF",
                    textShadow:
                      "0 3px 10px rgba(0,0,0,0.78), 0 0 28px rgba(0,0,0,0.5)",
                  }
                : {
                    maxWidth: "86%",
                    fontSize: 40,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    textAlign: "center",
                    color: "#FFFFFF",
                    backgroundColor: "rgba(0,0,0,0.58)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 12,
                    padding: "12px 18px",
                    textShadow: "0 2px 8px rgba(0,0,0,0.75)",
                    backdropFilter: "blur(2px)",
                  }
            }
          >
            {activeCaption}
          </div>
        </AbsoluteFill>
      ) : null}
      {visualizationEnabled && smoothBars?.bars ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            padding: "0",
            opacity: visualizationOpacity * introOutroOpacity,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${smoothBars.bars.length}, minmax(0, 1fr))`,
              gap: 4,
              alignItems: "end",
              height: 80, // Target height in pixels
              width: "100%",
              padding: "0 6px 0",
              background: "transparent",
            }}
          >
            {smoothBars.bars.map((value, index) => {
              
              // FIX 3: Removed all manual boosting/shimmer/minVisible hacks.
              // We use the 'value' directly from processAudioBars().
              const clamped = value; 

              const shade = paletteColors[index % paletteColors.length];
              return (
                <div
                  key={`bar-${index}`}
                  style={{
                    // Height is simply clamped value * max height (80%)
                    height: `${clamped * 80}%`, 
                    borderRadius: 5,
                    background: `linear-gradient(180deg, ${hexToRgba(
                      shade,
                      0.95
                    )} 0%, ${hexToRgba(shade, 0.35)} 100%)`,
                    boxShadow: `inset 0 1px 0 ${hexToRgba(
                      accentColor,
                      0.6
                    )}, 0 0 6px ${hexToRgba(accentColor, 0.3)}`,
                    opacity: 0.95,
                    transformOrigin: "center bottom",
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
