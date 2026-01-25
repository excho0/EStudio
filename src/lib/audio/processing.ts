const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type ProcessAudioBarsOptions = {
  gain?: number;
  curve?: number;
  noiseFloor?: number;
  lowBoost?: number;
  midBoost?: number;
  activityThreshold?: number;
  detailBoost?: number;
  contrast?: number;
  floorPercentile?: number;
  floorScale?: number;
  enableSoftGate?: boolean;
};

export const processAudioBars = (
  bars: number[] | null,
  {
    gain = 0.32,
    curve = 0.85,
    noiseFloor = 0.03,
    lowBoost = 1.1,
    midBoost = 0.2,
    activityThreshold = 0.35,
    detailBoost = 0.45,
    contrast = 1.15,
    floorPercentile = 0.45,
    floorScale = 0.8,
    enableSoftGate = true,
  }: ProcessAudioBarsOptions = {}
) => {
  if (!bars || bars.length === 0) {
    return { next: [], max: 0 };
  }

  const length = bars.length;
  const half = length / 2;
  const normalized = bars.map((raw, index) => {
    const neighborPrev = bars[index - 1] ?? raw;
    const neighborNext = bars[index + 1] ?? raw;
    const localAvg = (neighborPrev + raw + neighborNext) / 3;
    const detail = raw - localAvg;
    const enhanced = raw + detail * detailBoost;
    const smoothedRaw = enhanced * 0.65 + localAvg * 0.35;
    const position = index < half ? index : length - 1 - index;
    const positionT = position / half;
    const emphasis = Math.max(0.9, lowBoost - positionT * 0.35);
    const centerAtten = 0.85 + positionT * 0.2;
    const bassAtten = 0.7 + positionT * 0.6;
    const midShape = Math.exp(-Math.pow((positionT - 0.45) / 0.22, 2));
    const bandBoost = 1 + midShape * midBoost;
    const normalized = clamp01(
      smoothedRaw * gain * emphasis * centerAtten * bandBoost * bassAtten
    );
    const curved = Math.pow(normalized, curve);
    return curved < noiseFloor ? 0 : curved;
  });

  const mean = normalized.reduce((sum, value) => sum + value, 0) / length;
  const contrasted = normalized.map((value) =>
    clamp01((value - mean) * contrast + mean)
  );
  const maxValue = contrasted.reduce((max, value) => Math.max(max, value), 0);
  const threshold = maxValue * activityThreshold;
  const sorted = [...contrasted].sort((a, b) => a - b);
  const floorIndex = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * floorPercentile))
  );
  const baseFloor = sorted[floorIndex] ?? 0;
  const next = contrasted.map((value, index) => {
    const position = index < half ? index : length - 1 - index;
    const positionT = position / half;
    const highLift = 0.2 + positionT * 0.35;
    const gateStrength = enableSoftGate && positionT < 0.5 ? 4 : 0;
    const softGate =
      gateStrength === 0 ? 1 : 1 / (1 + Math.exp(-(value - threshold) * gateStrength));
    const floorWeight = 0.2 + (1 - positionT) * 0.5;
    const adaptiveFloor = baseFloor * floorScale * floorWeight;
    const gated =
      value <= adaptiveFloor
        ? 0
        : (value - adaptiveFloor) / Math.max(1e-4, 1 - adaptiveFloor);
    const baseline = gated * highLift * (0.6 + 0.4 * softGate);
    if (value <= threshold) {
      return baseline;
    }
    return gated * (0.9 + 0.1 * softGate);
  });

  return { next, max: maxValue };
};
