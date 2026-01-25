const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type ProcessAudioBarsOptions = {
  gain?: number;
  curve?: number;
  noiseFloor?: number;
  lowBoost?: number;
};

export const processAudioBars = (
  bars: number[] | null,
  {
    gain = 0.5,
    curve = 0.5,
    noiseFloor = 0.02,
    lowBoost = 1.5,
  }: ProcessAudioBarsOptions = {}
) => {
  if (!bars || bars.length === 0) {
    return { next: [], max: 0 };
  }

  let maxValue = 0;
  const length = bars.length;
  const half = length / 2;
  const next = bars.map((raw, index) => {
    const neighborPrev = bars[index - 1] ?? raw;
    const neighborNext = bars[index + 1] ?? raw;
    const smoothedRaw = (neighborPrev + raw * 2 + neighborNext) / 4;
    const position = index < half ? index : length - 1 - index;
    const positionT = position / half;
    const emphasis = Math.max(0.9, lowBoost - positionT * 0.4);
    const centerAtten = 0.85 + positionT * 0.2;
    const normalized = clamp01(smoothedRaw * gain * emphasis * centerAtten);
    const curved = Math.pow(normalized, curve);
    const target = curved < noiseFloor ? 0 : curved;
    maxValue = Math.max(maxValue, target);
    return target;
  });

  return { next, max: maxValue };
};
