import type { ProviderKey } from "@/lib/publishing/providers";

export type PublishMetadata = {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
};

export type PublishOptions = {
  privacy?: "public" | "unlisted" | "private";
  scheduleAt?: string | null;
};

export type PublishPayload = {
  userId?: string;
  contentId?: string;
  renderId: string;
  renderKey?: string;
  renderPath?: string;
  thumbnailKey?: string | null;
  thumbnailPath?: string | null;
  metadata: PublishMetadata;
  options?: PublishOptions;
  onProgress?: (progress: PublishProgress) => void;
};

export type PublishResult = {
  providerAssetId: string;
  providerUrl?: string;
  status?: "queued" | "publishing" | "published" | "failed" | "published_with_warning";
  warning?: string;
};

export type PublishProgress = {
  stage: "uploading" | "processing" | "thumbnail" | "complete";
  progress?: number;
  bytesUploaded?: number;
  bytesTotal?: number;
};

export type ProviderAdapter = {
  id: ProviderKey;
  upload: (payload: PublishPayload) => Promise<PublishResult>;
  updateMetadata?: (providerAssetId: string, payload: PublishPayload) => Promise<void>;
  getStatus?: (providerAssetId: string) => Promise<"queued" | "publishing" | "published" | "failed" | "published_with_warning">;
};
