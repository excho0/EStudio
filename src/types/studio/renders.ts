import type { z } from "zod";
import type { rendersResponseSchema } from "@/lib/data/render";

export type RenderListResponse = z.infer<typeof rendersResponseSchema>;
export type RenderItem = RenderListResponse["items"][number];
