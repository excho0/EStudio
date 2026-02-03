export type PublishRecord = {
  id: string;
  renderId: string;
  provider: string;
  providerAssetId: string;
  status: string;
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
