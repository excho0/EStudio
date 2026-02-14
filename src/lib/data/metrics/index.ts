import { z } from "zod";

/** GPU metric payload emitted to realtime clients. */
export const gpuMetricSchema = z.object({
  model: z.string(),
  vendor: z.string().nullable(),
  bus: z.string().nullable(),
  vramTotalMB: z.number().nullable(),
  vramUsedMB: z.number().nullable(),
  vramUsagePct: z.number().nullable(),
  utilizationGpu: z.number().nullable(),
  temperatureGpu: z.number().nullable(),
  fanSpeedPct: z.number().nullable(),
  powerDrawW: z.number().nullable(),
  powerLimitW: z.number().nullable(),
}).describe("GPU metric.");

/** System metrics payload emitted by runtime server. */
export const metricsPayloadSchema = z.object({
  cpu: z.object({
    load: z.number().nullable(),
    temperature: z.number().nullable(),
  }),
  memory: z.object({
    usage: z.number().nullable(),
    totalBytes: z.number().nullable(),
    usedBytes: z.number().nullable(),
  }),
  gpus: z.array(gpuMetricSchema),
}).describe("Metrics payload.");
