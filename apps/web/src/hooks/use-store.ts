import { useState, useEffect } from "react";
/**
 * This hook fix hydration when use persist to save hook data to localStorage
 */
export const useStore = <T, F>(
  store: (callback: (state: T) => unknown) => unknown,
  callback: (state: T) => F
) => {
  const result = store(callback) as F;
  const [data, setData] = useState<F>();

  useEffect(() => {
    const update = () => setData(result);
    const timeout = setTimeout(update, 0);
    return () => clearTimeout(timeout);
  }, [result]);

  return data;
};
