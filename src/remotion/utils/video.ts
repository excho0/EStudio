export type VideoSlice = {
  from: number;
  startFrom: number;
  duration: number;
};

export const buildVideoSlices = (
  startFrom: number,
  duration: number,
  videoFrames: number
) => {
  const slices: VideoSlice[] = [];
  let remaining = duration;
  let currentStart = startFrom;
  let offset = 0;

  while (remaining > 0) {
    if (currentStart >= videoFrames) {
      currentStart = 0;
    }
    const available = Math.max(0, videoFrames - currentStart);
    const sliceDuration = Math.min(remaining, available || remaining);
    slices.push({ from: offset, startFrom: currentStart, duration: sliceDuration });
    remaining -= sliceDuration;
    offset += sliceDuration;
    currentStart = 0;

    if (slices.length > 1000) {
      break;
    }
  }

  return slices;
};
