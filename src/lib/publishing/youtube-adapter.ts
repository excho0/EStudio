import fs from "fs";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

import type { PublishPayload, PublishResult, ProviderAdapter } from "@/lib/publishing/adapter";
import { getGoogleYoutubeClient } from "@/lib/publishing/google-youtube";

export const youtubeAdapter: ProviderAdapter = {
  id: "youtube",
  async upload(payload: PublishPayload): Promise<PublishResult> {
    if (!payload.userId) {
      throw new Error("Missing user id for YouTube upload.");
    }
    if (!payload.renderPath) {
      throw new Error("Missing render path for YouTube upload.");
    }

    const { youtube } = await getGoogleYoutubeClient(payload.userId);
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
          body: fs.createReadStream(payload.renderPath),
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
    let tempThumbnailPath: string | null = null;
    if (payload.thumbnailPath) {
      payload.onProgress?.({ stage: "thumbnail", progress: 0 });
      try {
        const { size } = await fsp.stat(payload.thumbnailPath);
        const maxBytes = 2 * 1024 * 1024;
        let thumbnailPath = payload.thumbnailPath;
        if (size > maxBytes) {
          const tmpPath = path.join(
            os.tmpdir(),
            `excho-thumb-${videoId}-${Date.now()}.jpg`
          );
          await sharp(payload.thumbnailPath)
            .jpeg({ quality: 80 })
            .toFile(tmpPath);
          tempThumbnailPath = tmpPath;
          thumbnailPath = tmpPath;
        }
        const { size: compressedSize } = await fsp.stat(thumbnailPath);
        if (compressedSize > maxBytes) {
          thumbnailWarning = "Thumbnail file is larger than 2MB.";
        } else {
          await youtube.thumbnails.set({
            videoId,
            media: { body: fs.createReadStream(thumbnailPath) },
          });
        }
      } catch (error) {
        thumbnailWarning =
          error instanceof Error ? error.message : "Thumbnail upload failed.";
      } finally {
        if (tempThumbnailPath) {
          await fsp.rm(tempThumbnailPath, { force: true });
        }
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
