import { useMemo } from "react";

import { clamp } from "@estudio/utils";

type UseMotionTransformArgs = {
  frame: number;
  fps: number;
  motionEnabled: boolean;
  motionAmountPx: number;
  motionSpeed: number;
  motionAttack: number;
  motionRelease: number;
  bassMotionEnergy: number;
};

export const useMotionTransform = ({
  frame,
  fps,
  motionEnabled,
  motionAmountPx,
  motionSpeed,
  motionAttack,
  motionRelease,
  bassMotionEnergy,
}: UseMotionTransformArgs) => {
  const motionEnergy = useMemo(() => {
    const target = clamp(bassMotionEnergy, 0, 1);
    const attack = clamp(motionAttack, 0.22, 0.995);
    const release = clamp(motionRelease, 0.06, 0.95);
    const gated = clamp((target - 0.04) / 0.72, 0, 1);
    const contour = Math.pow(gated, 1.18 - attack * 0.22);
    const body = contour * (0.42 + attack * 0.18 + release * 0.1);
    return clamp(body, 0, 1);
  }, [bassMotionEnergy, motionAttack, motionRelease]);

  const motionTime = (frame / fps) * Math.PI * 2 * Math.max(0, motionSpeed);
  const driftBase = 0.24;
  const motionBase = clamp(driftBase + motionEnergy * 0.76, 0, 1);
  const motionAmp = Math.max(0, motionAmountPx) * motionBase;
  const motionX = motionEnabled
    ? Math.sin(motionTime * 0.72 + Math.sin(motionTime * 0.18) * 0.18) * motionAmp
    : 0;
  const motionY = motionEnabled
    ? Math.cos(motionTime * 0.58 + 0.9) * motionAmp * 0.32 +
      Math.sin(motionTime * 0.24 + 1.6) * motionAmp * 0.12 +
      motionAmp * 0.18
    : 0;
  const motionTransform = motionEnabled
    ? `translate(${motionX.toFixed(2)}px, ${motionY.toFixed(2)}px)`
    : undefined;

  return {
    motionEnergy,
    motionBase,
    motionAmp,
    motionX,
    motionY,
    motionTransform,
  };
};
