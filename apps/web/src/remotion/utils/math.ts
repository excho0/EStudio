export const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
