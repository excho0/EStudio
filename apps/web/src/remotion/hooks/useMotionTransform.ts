import { useMemo, useRef } from "react";
import { clamp, lerp } from "../utils";

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
  const motionEnvelopeRef = useRef(0);
  const motionLastEnergyRef = useRef(0);
  const motionTransientRef = useRef(0);
  const motionDriftRef = useRef(0);

  const motionEnergy = useMemo(() => {
    const target = Math.max(0, Math.min(1, bassMotionEnergy));
    if (frame === 0) {
      motionEnvelopeRef.current = target;
      motionLastEnergyRef.current = target;
      motionTransientRef.current = 0;
      motionDriftRef.current = target;
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
    const transient = lerp(motionTransientRef.current, rise, 0.28);
    motionTransientRef.current = transient;
    const drift = lerp(motionDriftRef.current, target, 0.08);
    motionDriftRef.current = drift;
    return Math.min(1, drift * 0.64 + smoothed * 0.28 + transient * 1.1);
  }, [bassMotionEnergy, frame, motionAttack, motionRelease]);

  const motionTime = (frame / fps) * Math.PI * 2 * Math.max(0, motionSpeed);
  const motionBase = Math.max(0, Math.min(1, motionEnergy * 1.18 + 0.06));
  const motionAmp = Math.max(0, motionAmountPx) * motionBase;
  const motionXRaw = motionEnabled ? Math.sin(motionTime) * motionAmp : 0;
  const motionYRaw = motionEnabled
    ? Math.cos(motionTime * 0.9) * motionAmp * 0.45 + motionAmp * 0.25
    : 0;

  const motionXRef = useRef(0);
  const motionYRef = useRef(0);
  const motionLerpAlpha = 0.14;
  const motionMaxStep = Math.max(0.35, motionAmountPx * 0.18);
  if (frame === 0) {
    motionXRef.current = motionXRaw;
    motionYRef.current = motionYRaw;
  } else {
    const nextX = lerp(motionXRef.current, motionXRaw, motionLerpAlpha);
    const nextY = lerp(motionYRef.current, motionYRaw, motionLerpAlpha);
    const dx = nextX - motionXRef.current;
    const dy = nextY - motionYRef.current;
    motionXRef.current += clamp(dx, -motionMaxStep, motionMaxStep);
    motionYRef.current += clamp(dy, -motionMaxStep, motionMaxStep);
  }

  const motionX = motionXRef.current;
  const motionY = motionYRef.current;
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
