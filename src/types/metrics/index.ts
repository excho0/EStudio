import type { z } from "zod";
import type { metricsPayloadSchema } from "@/lib/data/metrics";

export type MetricsPayload = z.infer<typeof metricsPayloadSchema>;
