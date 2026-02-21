import type { z } from "zod";
import type {
  contentItemSchema,
  contentListResponseSchema,
} from "@/lib/data/content/schemas";
export type { VideoLoopSettings } from "./modes";

export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentListResponse = z.infer<typeof contentListResponseSchema>;
