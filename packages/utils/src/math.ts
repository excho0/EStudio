/**
 * Linearly interpolates between two numbers.
 *
 * @param from - The starting value.
 * @param to - The ending value.
 * @param alpha - The interpolation factor, typically between 0 and 1.
 * @returns The interpolated value.
 */
export const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

/**
 * Restricts a number to a given inclusive range.
 *
 * @param value - The number to clamp.
 * @param min - The minimum allowed value.
 * @param max - The maximum allowed value.
 * @returns The clamped number.
 */
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
