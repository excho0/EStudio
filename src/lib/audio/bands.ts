const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type LogBandOptions = {
  magnitudes: number[];
  sampleRate: number;
  fftSize: number;
  bands: number;
  minFreq?: number;
  maxFreq?: number;
};

export const getLogBands = ({
  magnitudes,
  sampleRate,
  fftSize,
  bands,
  minFreq = 60,
  maxFreq = 20000,
}: LogBandOptions) => {
  const nyquist = sampleRate / 2;
  const min = clamp(minFreq, 1, nyquist);
  const max = clamp(maxFreq, min + 1, nyquist);
  const minLog = Math.log10(min);
  const maxLog = Math.log10(max);
  const binHz = nyquist / (fftSize / 2);

  const results = new Array(bands).fill(0);
  for (let i = 0; i < bands; i += 1) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const f0 = Math.pow(10, minLog + (maxLog - minLog) * t0);
    const f1 = Math.pow(10, minLog + (maxLog - minLog) * t1);
    const b0 = Math.floor(f0 / binHz);
    const b1 = Math.max(b0 + 1, Math.floor(f1 / binHz));
    let sum = 0;
    let count = 0;
    for (let b = b0; b <= b1; b += 1) {
      const value = magnitudes[b] ?? 0;
      sum += value;
      count += 1;
    }
    results[i] = count > 0 ? sum / count : 0;
  }

  return results;
};
