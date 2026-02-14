import type { z } from "zod";
import type {
  publishRecordSchema,
  studioPublishMetadataSchema,
} from "@/lib/data/publish";

export type PublishRecord = z.infer<typeof publishRecordSchema>;
export type PublishListResponse = {
  publishes: PublishRecord[];
};
export type PublishMetadata = z.infer<typeof studioPublishMetadataSchema>;

export type ProviderSectionProps = {
  provider: string;
  items: PublishRecord[];
  isMobile: boolean;
  contentId: string;
  onViewError: (item: PublishRecord) => void;
  onDelete: (item: PublishRecord) => void;
};
