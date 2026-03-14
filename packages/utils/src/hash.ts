/**
 * Produces a stable non-cryptographic positive integer hash for a string.
 *
 * @param value - The string to hash.
 * @returns A positive integer hash.
 */
export const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};
