import FFT from "fft.js";
import type { MediaUtilsAudioData } from "@remotion/media-utils";

type SpectrumOptions = {
  audioData: MediaUtilsAudioData;
  frame: number;
  fps: number;
  fftSize?: number;
  dataOffsetInSeconds?: number;
};

const hannWindow = (index: number, size: number) =>
  0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));

export const getAudioSpectrum = ({
  audioData,
  frame,
  fps,
  fftSize = 2048,
  dataOffsetInSeconds = 0,
}: SpectrumOptions) => {
  const channel = audioData.channelWaveforms[0];
  const sampleRate = audioData.sampleRate;
  const time = frame / fps + dataOffsetInSeconds;
  const startSample = Math.max(0, Math.floor(time * sampleRate));

  const input = new Array(fftSize).fill(0);
  for (let i = 0; i < fftSize; i += 1) {
    const sample = channel[startSample + i] ?? 0;
    input[i] = sample * hannWindow(i, fftSize);
  }

  const fft = new FFT(fftSize);
  const output = fft.createComplexArray();
  fft.realTransform(output, input);
  fft.completeSpectrum(output);

  const magnitudes = new Array(fftSize / 2).fill(0);
  let max = 0;
  for (let i = 0; i < fftSize / 2; i += 1) {
    const real = output[i * 2];
    const imag = output[i * 2 + 1];
    const mag = Math.sqrt(real * real + imag * imag);
    magnitudes[i] = mag;
    if (mag > max) max = mag;
  }

  if (max === 0) {
    return magnitudes.map(() => 0);
  }

  return magnitudes.map((value) => value / max);
};
