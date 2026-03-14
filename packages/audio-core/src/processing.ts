export type ProcessAudioBarsOptions = {
  maxOutput?: number;
  gain?: number;
  curve?: number;
  noiseFloor?: number;
  lowBoost?: number;
  midBoost?: number;
  fps?: number;
  attackMs?: number;
  releaseMs?: number;
  durationAveragingFrames?: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const processAudioBars = (
  bars: number[] | null,
  {
    maxOutput = 100,
    gain = 0.6,
    curve = 0.6,
    noiseFloor = 0.01,
    lowBoost = 1.05,
    midBoost = 0.35,
  }: ProcessAudioBarsOptions = {}
) => {
  if (!bars || bars.length === 0) {
    return { next: [], max: 0 };
  }

  const length = bars.length;
  const half = length / 2;

  const normalized = bars.map((raw, index) => {
    const position = index < half ? index : length - 1 - index;
    const positionT = position / half;

    const emphasis = Math.max(0.9, lowBoost - positionT * 0.35);
    const centerAtten = 0.85 + positionT * 0.2;
    const bassAtten = 0.7 + positionT * 0.6;
    const midShape = Math.exp(-Math.pow((positionT - 0.45) / 0.22, 2));
    const bandBoost = 1 + midShape * midBoost;

    const adjusted = clamp01(raw * gain * emphasis * centerAtten * bandBoost * bassAtten);
    const curved = Math.pow(adjusted, curve);

    return curved < noiseFloor ? 0 : curved;
  });

  const separated = [...normalized];
  const sensitivity = 0.2;

  for (let i = 0; i < length; i += 1) {
    const currentValue = normalized[i];
    if (currentValue > 0.1) {
      if (i > 0) {
        const left = normalized[i - 1];
        if (left > currentValue + 0.05) separated[i] = Math.max(0, separated[i] - left * sensitivity);
      }
      if (i < length - 1) {
        const right = normalized[i + 1];
        if (right > currentValue + 0.05) separated[i] = Math.max(0, separated[i] - right * sensitivity);
      }
    }
  }

  const outputScale = Math.max(1, maxOutput) / 100;
  const next = separated.map((value) => clamp01(value * outputScale));

  return { next, max: 0 };
};
