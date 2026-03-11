import { useMemo, useRef } from "react";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { getAudioSpectrum } from "../../lib/audio/fft";
import { getLogBands } from "../../lib/audio/bands";
import { processAudioBars } from "../../lib/audio/processing";
import { clamp, lerp } from "../utils";

type UseAudioReactiveMetricsArgs = {
  audioData: MediaUtilsAudioData | null;
  frame: number;
  fps: number;
  rangeStartFrames: number;
  rangeEndFrames: number;
  resolvedVisualizationBars: number;
  visualizationEnabled: boolean;
  edgeRaysEnabled: boolean;
  edgeRaysVocalBalance: number;
  edgeRaysIntensity: number;
};

export const useAudioReactiveMetrics = ({
  audioData,
  frame,
  fps,
  rangeStartFrames,
  rangeEndFrames,
  resolvedVisualizationBars,
  visualizationEnabled,
  edgeRaysEnabled,
  edgeRaysVocalBalance,
  edgeRaysIntensity,
}: UseAudioReactiveMetricsArgs) => {
  const fftSize = 2048;

  const smoothBars = useMemo(() => {
    if (!visualizationEnabled && !edgeRaysEnabled) return null;
    if (!audioData) return null;

    const LOOKBACK_FRAMES = 5;
    const DECAY_FACTOR = 0.62;
    const INPUT_SMOOTHING = 2;
    const SPATIAL_SMOOTHING = 1;
    const BANDS = resolvedVisualizationBars;

    const totalFramesNeeded = LOOKBACK_FRAMES + INPUT_SMOOTHING;
    const range = Array.from({ length: totalFramesNeeded }, (_, i) => i);

    const rawHistory = range.map((offset) => {
      const targetFrame = clamp(
        rangeStartFrames + frame - offset,
        rangeStartFrames,
        Math.max(rangeStartFrames, rangeEndFrames - 1)
      );

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

      const { next } = processAudioBars(bands, {
        maxOutput: 100,
        gain: 2.45,
        curve: 0.92,
        noiseFloor: 0.024,
      });
      return next;
    });

    const smoothedHistory: number[][] = [];
    for (let i = 0; i < LOOKBACK_FRAMES; i += 1) {
      const currentRaw = rawHistory[i];
      if (!currentRaw) {
        smoothedHistory.push([]);
        continue;
      }

      const smoothedFrame = currentRaw.map((val, barIdx) => {
        let sum = val;
        let count = 1;
        for (let j = 1; j < INPUT_SMOOTHING; j += 1) {
          const pastFrame = rawHistory[i + j];
          if (pastFrame) {
            sum += pastFrame[barIdx] ?? 0;
            count += 1;
          }
        }
        return sum / count;
      });

      smoothedHistory.push(smoothedFrame);
    }

    const currentSmoothedBars = smoothedHistory[0];
    if (!currentSmoothedBars) return null;

    const temporalBars = currentSmoothedBars.map((_, barIdx) => {
      let weightedSum = 0;
      let weightTotal = 0;
      for (let timeOffset = 0; timeOffset < smoothedHistory.length; timeOffset += 1) {
        const pastBars = smoothedHistory[timeOffset];
        if (!pastBars) continue;
        const weight = Math.pow(DECAY_FACTOR, timeOffset);
        weightedSum += (pastBars[barIdx] ?? 0) * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : 0;
    });

    const spatialBars = temporalBars.map((_, barIdx) => {
      let sum = 0;
      let count = 0;
      for (let offset = -SPATIAL_SMOOTHING; offset <= SPATIAL_SMOOTHING; offset += 1) {
        const idx = barIdx + offset;
        if (idx < 0 || idx >= temporalBars.length) continue;
        sum += temporalBars[idx] ?? 0;
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
    rangeEndFrames,
    rangeStartFrames,
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

    const gateTarget = rise > 0.008 || target > 0.05 ? 1 : 0;
    const gate = gateTarget > gateRef.current
      ? lerp(gateRef.current, gateTarget, 0.72)
      : lerp(gateRef.current, gateTarget, 0.26);
    gateRef.current = gate;

    const current = glowRef.current;
    const attack = 0.88;
    const release = 0.32;
    const smoothed =
      target > current
        ? lerp(current, target, attack)
        : lerp(current, target, release);
    glowRef.current = smoothed;

    const kick = transient * 2.4 * gate;
    const combined = Math.min(1, smoothed + kick);
    const output = lerp(glowOutputRef.current, combined, 0.78);
    glowOutputRef.current = output;
    return output;
  }, [edgeEnergy, edgeRaysIntensity, frame]);

  return {
    smoothBars,
    edgeEnergy,
    bassMotionEnergy,
    glowIntensity,
  };
};
