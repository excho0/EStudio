import { useMemo } from "react";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { getAudioSpectrum, getLogBands, processAudioBars } from "@estudio/audio-core";
import { clamp } from "@estudio/utils";

type UseAudioBandMetricsArgs = {
  audioData: MediaUtilsAudioData | null;
  frame: number;
  fps: number;
  rangeStartFrames: number;
  rangeEndFrames: number;
  resolvedBandCount: number;
  enabled: boolean;
};

export const useAudioBandMetrics = ({
  audioData,
  frame,
  fps,
  rangeStartFrames,
  rangeEndFrames,
  resolvedBandCount,
  enabled,
}: UseAudioBandMetricsArgs) => {
  const fftSize = 2048;

  return useMemo(() => {
    if (!enabled) return null;
    if (!audioData) return null;

    const LOOKBACK_FRAMES = 5;
    const DECAY_FACTOR = 0.62;
    const INPUT_SMOOTHING = 2;
    const SPATIAL_SMOOTHING = 1;

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
        bands: resolvedBandCount,
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

      const smoothedFrame = currentRaw.map((value, barIndex) => {
        let sum = value;
        let count = 1;
        for (let j = 1; j < INPUT_SMOOTHING; j += 1) {
          const pastFrame = rawHistory[i + j];
          if (pastFrame) {
            sum += pastFrame[barIndex] ?? 0;
            count += 1;
          }
        }
        return sum / count;
      });

      smoothedHistory.push(smoothedFrame);
    }

    const currentBands = smoothedHistory[0];
    if (!currentBands) return null;

    const temporalBands = currentBands.map((_, barIndex) => {
      let weightedSum = 0;
      let weightTotal = 0;
      for (let timeOffset = 0; timeOffset < smoothedHistory.length; timeOffset += 1) {
        const pastBands = smoothedHistory[timeOffset];
        if (!pastBands) continue;
        const weight = Math.pow(DECAY_FACTOR, timeOffset);
        weightedSum += (pastBands[barIndex] ?? 0) * weight;
        weightTotal += weight;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : 0;
    });

    const smoothedBands = temporalBands.map((_, barIndex) => {
      let sum = 0;
      let count = 0;
      for (let offset = -SPATIAL_SMOOTHING; offset <= SPATIAL_SMOOTHING; offset += 1) {
        const index = barIndex + offset;
        if (index < 0 || index >= temporalBands.length) continue;
        sum += temporalBands[index] ?? 0;
        count += 1;
      }
      return count > 0 ? sum / count : 0;
    });

    return {
      smoothedBands,
      currentBands,
    };
  }, [
    audioData,
    enabled,
    frame,
    fps,
    rangeEndFrames,
    rangeStartFrames,
    resolvedBandCount,
  ]);
};
