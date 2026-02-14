import type { z } from "zod";
import type { renderProgressSchema } from "@/lib/data/render";

export type RenderProgress = z.infer<typeof renderProgressSchema>;
