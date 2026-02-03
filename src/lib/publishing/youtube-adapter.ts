import { Readable } from "stream";
import sharp from "sharp";

import type { PublishPayload, PublishResult, ProviderAdapter } from "@/types";
import { getGoogleYoutubeClient } from "@/lib/publishing/google-youtube";
import { getStorage } from "@/lib/storage";

export const youtubeAdapter: ProviderAdapter = {
  id: "youtube",
  async deleteAsset({ userId, providerAssetId }) {
    const { youtube } = await getGoogleYoutubeClient(userId);
    await youtube.videos.delete({ id: providerAssetId });
  },
  async upload(payload: PublishPayload): Promise<PublishResult> {
    if (!payload.userId) {
      throw new Error("Missing user id for YouTube upload.");
    }
    if (!payload.renderKey) {
      throw new Error("Missing render path for YouTube upload.");
    }

    const { youtube } = await getGoogleYoutubeClient(payload.userId);
    const storage = getStorage();
    const title = payload.metadata.title?.trim() || "Untitled upload";
    const description = payload.metadata.description?.trim() || undefined;
    const requestedPrivacy = payload.options?.privacy ?? "private";
    const scheduleAt = payload.options?.scheduleAt ?? undefined;
    const privacy = scheduleAt ? "private" : requestedPrivacy;
    const publishAt = scheduleAt ?? undefined;

    payload.onProgress?.({ stage: "uploading", progress: 0 });

    const response = await youtube.videos.insert(
      {
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            tags: payload.metadata.tags,
            categoryId: payload.metadata.categoryId,
          },
          status: {
            privacyStatus: privacy,
            publishAt,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: storage.createReadStream(payload.renderKey),
        },
      },
      {
        onUploadProgress: (event) => {
          if (!event || typeof event.bytesRead !== "number") return;
          const total = event.total ? Number(event.total) : undefined;
          const progress = total ? event.bytesRead / total : undefined;
          payload.onProgress?.({
            stage: "uploading",
            progress,
            bytesUploaded: event.bytesRead,
            bytesTotal: total,
          });
        },
      }
    );

    const videoId = response.data.id ?? null;
    if (!videoId) {
      throw new Error("YouTube upload failed to return a video id.");
    }

    let thumbnailWarning: string | null = null;
    if (payload.thumbnailKey) {
      payload.onProgress?.({ stage: "thumbnail", progress: 0 });
      try {
        const maxBytes = 2 * 1024 * 1024;
        const raw = await storage.readFile(payload.thumbnailKey);
        let buffer = raw;
        if (raw.length > maxBytes) {
          buffer = await sharp(raw).jpeg({ quality: 80 }).toBuffer();
        }
        if (buffer.length > maxBytes) {
          thumbnailWarning = "Thumbnail file is larger than 2MB.";
        } else {
          await youtube.thumbnails.set({
            videoId,
            media: { body: Readable.from(buffer) },
          });
        }
      } catch (error) {
        thumbnailWarning =
          error instanceof Error ? error.message : "Thumbnail upload failed.";
      }
    }

    payload.onProgress?.({ stage: "complete", progress: 1 });

    return {
      providerAssetId: videoId,
      providerUrl: `https://youtu.be/${videoId}`,
      status: thumbnailWarning ? "published_with_warning" : "published",
      warning: thumbnailWarning ?? undefined,
    };
  },
  async updateMetadata(providerAssetId: string, payload: PublishPayload) {
    void providerAssetId;
    void payload;
    throw new Error("YouTube updateMetadata adapter not implemented yet.");
  },
  async getStatus(providerAssetId: string) {
    void providerAssetId;
    throw new Error("YouTube getStatus adapter not implemented yet.");
  },
};
