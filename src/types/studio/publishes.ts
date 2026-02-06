export type PublishRecord = {
  id: string;
  renderId: string;
  provider: string;
  providerAccountId?: string | null;
  providerAssetId: string | null;
  status: "draft" | "queued" | "publishing" | "published" | "published_with_warning" | "failed" | "deleted";
  metadata: string | null;
  error?: string | null;
  updatedAt?: number | string | Date | null;
  createdAt?: number | string | Date | null;
};

export type PublishMetadata = {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  options?: {
    privacy?: string;
    scheduleAt?: string | null;
  };
};

export type PublishListResponse = {
  publishes: PublishRecord[];
};

export type ProviderSectionProps = {
  provider: string;
  items: PublishRecord[];
  isMobile: boolean;
  contentId: string;
  onViewError: (item: PublishRecord) => void;
  onDelete: (item: PublishRecord) => void;
};
