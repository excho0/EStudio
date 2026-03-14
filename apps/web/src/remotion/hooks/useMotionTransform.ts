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
    const contour = Math.pow(target, 0.82);
    const bias = contour * (0.52 + attack * 0.24 + release * 0.08);
    const microPulse =
      Math.sin((frame / Math.max(1, fps)) * Math.PI * 2 * Math.max(0, motionSpeed) * 0.42) *
      contour *
      0.05;
    return clamp(bias + Math.max(0, microPulse), 0, 1);
  }, [bassMotionEnergy, fps, frame, motionAttack, motionRelease, motionSpeed]);

  const motionTime = (frame / fps) * Math.PI * 2 * Math.max(0, motionSpeed);
  const motionBase = clamp(motionEnergy * 1.08 + 0.04, 0, 1);
  const motionAmp = Math.max(0, motionAmountPx) * motionBase;
  const motionX = motionEnabled ? Math.sin(motionTime) * motionAmp : 0;
  const motionY = motionEnabled
    ? Math.cos(motionTime * 0.9) * motionAmp * 0.45 + motionAmp * 0.25
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
