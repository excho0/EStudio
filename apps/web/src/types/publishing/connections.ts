import type { z } from "zod";
import type { publishProviderResponseSchema } from "@/lib/data/publish";

type ProviderConnectionPayload = z.infer<typeof publishProviderResponseSchema>;

export type ProviderConnectionState = ProviderConnectionPayload & {
  loading: boolean;
  enabled: boolean;
};
