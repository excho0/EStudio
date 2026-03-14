import { clamp } from "@estudio/utils";

const DEFAULT_FOCUS_MIN = 200;
const DEFAULT_FOCUS_MAX = 2000;
const DEFAULT_FOCUS_RATIO = 0.6;
const DEFAULT_LOW_RATIO = 0.2;

export type LogBandOptions = {
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
  const binHz = nyquist / (fftSize / 2);

  const results = new Array(bands).fill(0);

  const focusMin = clamp(DEFAULT_FOCUS_MIN, min, max);
  const focusMax = clamp(DEFAULT_FOCUS_MAX, focusMin + 1, max);
  const focusRatio = DEFAULT_FOCUS_RATIO;
  const lowRatio = DEFAULT_LOW_RATIO;

  const bandsLow = Math.max(1, Math.round(bands * lowRatio));
  const bandsMid = Math.max(1, Math.round(bands * focusRatio));
  const bandsHigh = Math.max(1, bands - bandsLow - bandsMid);

  const fillBands = (
    startIndex: number,
    count: number,
    rangeMin: number,
    rangeMax: number
  ) => {
    const minLog = Math.log10(rangeMin);
    const maxLog = Math.log10(rangeMax);
    for (let i = 0; i < count; i += 1) {
      const t0 = i / count;
      const t1 = (i + 1) / count;
      const f0 = Math.pow(10, minLog + (maxLog - minLog) * t0);
      const f1 = Math.pow(10, minLog + (maxLog - minLog) * t1);
      const b0 = Math.floor(f0 / binHz);
      const b1 = Math.max(b0 + 1, Math.floor(f1 / binHz));
      let sumSq = 0;
      let countBins = 0;
      for (let b = b0; b <= b1; b += 1) {
        const value = magnitudes[b] ?? 0;
        sumSq += value * value;
        countBins += 1;
      }
      const rms = countBins > 0 ? Math.sqrt(sumSq / countBins) : 0;
      results[startIndex + i] = rms;
    }
  };

  fillBands(0, bandsLow, min, focusMin);
  fillBands(bandsLow, bandsMid, focusMin, focusMax);
  fillBands(bandsLow + bandsMid, bandsHigh, focusMax, max);

  return results;
};
