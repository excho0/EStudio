import { z } from "zod";

import { contentItemSchema } from "@/lib/data/content";

export type ContentItem = z.infer<typeof contentItemSchema>;

export type ContentListResponse = {
  items: ContentItem[];
  total: number;
  page: number;
  limit: number;
};
