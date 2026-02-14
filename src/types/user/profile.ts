import type { z } from "zod";
import type {
  connectionsResponseSchema,
  profilePayloadSchema,
} from "@/lib/data/user";

export type ProfilePayload = z.infer<typeof profilePayloadSchema>;
export type ConnectionsResponse = z.infer<typeof connectionsResponseSchema>;
