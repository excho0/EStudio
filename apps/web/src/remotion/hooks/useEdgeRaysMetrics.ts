import { useMemo } from "react";

import { clamp } from "@estudio/utils";

type UseEdgeRaysMetricsArgs = {
  smoothedBands: number[] | null;
  currentBands: number[] | null;
  edgeRaysVocalBalance: number;
  edgeRaysIntensity: number;
  frame: number;
};

export const useEdgeRaysMetrics = ({
  smoothedBands,
  currentBands,
  edgeRaysVocalBalance,
  edgeRaysIntensity,
  frame,
}: UseEdgeRaysMetricsArgs) => {
  const edgeEnergy = useMemo(() => {
    const smoothed = smoothedBands;
    const current = currentBands;
    const sourceBands = smoothed ?? current;
    if (!sourceBands || sourceBands.length === 0) return 0;

    const total = sourceBands.length;
    const averageRange = (
      values: number[],
      start: number,
      end: number,
      startWeight: number,
      endWeight: number
    ) => {
      const safeStart = Math.max(0, Math.min(total - 1, start));
      const safeEnd = Math.max(safeStart + 1, Math.min(total, end));
      let sum = 0;
      let weightSum = 0;
      const span = Math.max(1, safeEnd - safeStart - 1);
      for (let i = safeStart; i < safeEnd; i += 1) {
        const t = (i - safeStart) / span;
        const weight = startWeight + (endWeight - startWeight) * t;
        sum += (values[i] ?? 0) * weight;
        weightSum += weight;
      }
      return weightSum > 0 ? sum / weightSum : 0;
    };

    const lowEnd = Math.max(1, Math.floor(total * 0.14));
    const lowMidEnd = Math.max(lowEnd + 1, Math.floor(total * 0.3));
    const vocalStart = Math.max(lowEnd, Math.floor(total * 0.24));
    const vocalEnd = Math.max(vocalStart + 1, Math.floor(total * 0.56));
    const highStart = Math.max(vocalEnd, Math.floor(total * 0.56));

    const lowAvg = averageRange(sourceBands, 0, lowEnd, 1.2, 0.86);
    const lowMidAvg = averageRange(sourceBands, lowEnd, lowMidEnd, 1.0, 0.88);
    const vocalAvg = averageRange(sourceBands, vocalStart, vocalEnd, 1.0, 0.9);
    const highAvg = averageRange(sourceBands, highStart, total, 0.82, 0.62);

    let overallSum = 0;
    for (let i = 0; i < total; i += 1) {
      overallSum += sourceBands[i] ?? 0;
    }
    const overallAvg = overallSum / total;

    const vocalPreference = clamp(edgeRaysVocalBalance, 0, 1);
    const lowBlend = lowAvg * 0.58 + lowMidAvg * 0.42;
    const presenceBlend = vocalAvg * 0.72 + highAvg * 0.28;
    const balancedBlend =
      lowBlend * (0.68 - vocalPreference * 0.22) +
      presenceBlend * (0.22 + vocalPreference * 0.2);
    const crest = Math.max(lowBlend, vocalAvg, highAvg * 0.84);

    const currentLowBlend = current
      ? averageRange(current, 0, lowMidEnd, 1.14, 0.9)
      : lowBlend;
    const currentPresenceBlend = current
      ? averageRange(current, vocalStart, total, 0.96, 0.74)
      : presenceBlend;
    const currentBlend = current
      ? currentLowBlend * (0.62 - vocalPreference * 0.14) +
        currentPresenceBlend * (0.38 + vocalPreference * 0.14)
      : balancedBlend;

    const smoothedLowBlend = smoothed
      ? averageRange(smoothed, 0, lowMidEnd, 1.06, 0.88)
      : lowBlend;
    const smoothedPresenceBlend = smoothed
      ? averageRange(smoothed, vocalStart, total, 0.92, 0.72)
      : presenceBlend;
    const lowMotionLift = Math.max(0, currentLowBlend - smoothedLowBlend);
    const presenceMotionLift = Math.max(0, currentPresenceBlend - smoothedPresenceBlend);
    const globalMotionLift = current
      ? Math.max(0, averageRange(current, 0, total, 1.0, 0.82) - overallAvg)
      : 0;

    const motionLift =
      lowMotionLift * (0.62 - vocalPreference * 0.18) +
      presenceMotionLift * (0.22 + vocalPreference * 0.12) +
      globalMotionLift * 0.16;

    const mixed =
      balancedBlend * 0.42 +
      currentBlend * 0.24 +
      crest * 0.12 +
      overallAvg * 0.06 +
      motionLift * 0.16;
    const normalized = clamp((mixed - 0.0035) / 0.46, 0, 1);
    return Math.pow(normalized, 0.7);
  }, [smoothedBands, currentBands, edgeRaysVocalBalance]);

  const glowIntensity = useMemo(() => {
    const intensityLevel = clamp(edgeRaysIntensity, 0, 1);
    const intensityResponse = Math.pow(intensityLevel, 0.42);
    const intensityScale = 0.24 + intensityResponse * 1.18;
    const target = 1 - Math.exp(-edgeEnergy * intensityScale * 1.85);
    const contour = Math.pow(target, 0.94);
    const lift = edgeEnergy * (0.04 + intensityResponse * 0.18);
    const pulse =
      (Math.sin(frame * 0.028) * edgeEnergy * 0.03 +
        Math.cos(frame * 0.017) * edgeEnergy * 0.02) *
      intensityResponse;
    const gated = contour + lift + pulse;
    return clamp(gated * (0.1 + intensityResponse * 0.9), 0, 1);
  }, [edgeEnergy, edgeRaysIntensity, frame]);

  return {
    edgeEnergy,
    glowIntensity,
  };
};
