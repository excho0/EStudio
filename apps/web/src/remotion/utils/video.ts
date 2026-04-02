export type VideoSlice = {
  from: number;
  startFrom: number;
  duration: number;
  sourceDuration: number;
};

export const buildVideoSlices = (
  startFrom: number,
  duration: number,
  sourceDuration: number,
  videoFrames: number,
  playbackRate: number
) => {
  const slices: VideoSlice[] = [];
  const safePlaybackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  let remainingOutput = duration;
  let remainingSource = sourceDuration;
  let currentStart = startFrom;
  let outputOffset = 0;

  while (remainingOutput > 0 && remainingSource > 0) {
    if (currentStart >= videoFrames) {
      currentStart = 0;
    }
    const available = Math.max(0, videoFrames - currentStart);
    const sliceSourceDuration = Math.min(remainingSource, available || remainingSource);
    const rawOutputDuration = sliceSourceDuration / safePlaybackRate;
    const sliceOutputDuration = Math.min(
      remainingOutput,
      Math.max(1, Math.round(rawOutputDuration))
    );
    slices.push({
      from: outputOffset,
      startFrom: currentStart,
      duration: sliceOutputDuration,
      sourceDuration: sliceSourceDuration,
    });
    remainingOutput -= sliceOutputDuration;
    remainingSource -= sliceSourceDuration;
    outputOffset += sliceOutputDuration;
    currentStart = 0;

    if (slices.length > 1000) {
      break;
    }
  }

  return slices;
};
