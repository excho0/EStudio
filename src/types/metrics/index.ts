"use client";

export type MetricsPayload = {
  cpu: {
    load: number | null;
    temperature: number | null;
  };
  memory: {
    usage: number | null;
    totalBytes: number | null;
    usedBytes: number | null;
  };
  gpus: {
    model: string;
    vendor: string | null;
    bus: string | null;
    vramTotalMB: number | null;
    vramUsedMB: number | null;
    vramUsagePct: number | null;
    utilizationGpu: number | null;
    temperatureGpu: number | null;
    fanSpeedPct: number | null;
    powerDrawW: number | null;
    powerLimitW: number | null;
  }[];
};
