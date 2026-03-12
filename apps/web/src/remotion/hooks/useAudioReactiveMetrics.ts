import { useMemo } from "react";

type UseAudioReactiveMetricsArgs = {
  currentBands: number[] | null;
};

export const useAudioReactiveMetrics = ({
  currentBands,
}: UseAudioReactiveMetricsArgs) => {
  const bassMotionEnergy = useMemo(() => {
    if (!currentBands || currentBands.length === 0) return 0;
    const total = currentBands.length;
    const bassEnd = Math.max(1, Math.floor(total * 0.14));
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i += 1) {
      bassSum += currentBands[i] ?? 0;
    }
    const bassAvg = bassSum / bassEnd;
    const normalized = Math.max(0, Math.min(1, (bassAvg - 0.006) / 0.35));
    return Math.pow(normalized, 0.7);
  }, [currentBands]);

  return {
    bassMotionEnergy,
  };
};
