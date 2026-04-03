import { z } from "zod";
import { captionDocumentSchema } from "@/types";
import { ApiClient } from "@/lib/sdk/client";
import { settingsCaptionBackendSchema } from "@/lib/data/settings/schemas";
import {
  contentItemSchema,
  contentListResponseSchema,
} from "@/lib/data/content/schemas";
import {
  contentPublishesResponseSchema,
  createPublishResponseSchema,
  retryPublishResponseSchema,
} from "@/lib/data/publish";
import {
  triggerRenderRequestSchema,
  renderProgressMapResponseSchema,
  rendersResponseSchema,
  rescanResponseSchema,
  triggerRenderResponseSchema,
} from "@/lib/data/render";
import {
  captionProgressMapResponseSchema,
  type CaptionProgress,
} from "@/lib/data/captions/progress";
import {
  publishProgressMapResponseSchema,
  type PublishProgressSnapshot,
} from "@/lib/data/publish/progress";

const client = new ApiClient();

type ContentQuery = {
  q?: string;
  status?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  limit?: number;
};

export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentListResponse = z.infer<typeof contentListResponseSchema>;
export type ContentRendersResponse = z.infer<typeof rendersResponseSchema>;
export type ContentProgressResponse = z.infer<
  typeof renderProgressMapResponseSchema
>;
export type ContentCaptionProgressResponse = {
  items?: Record<string, CaptionProgress>;
};
export type ContentPublishProgressResponse = {
  items?: Record<string, PublishProgressSnapshot>;
};
export type ContentRescanResponse = z.infer<typeof rescanResponseSchema>;
export type ContentPublishesResponse = z.infer<
  typeof contentPublishesResponseSchema
>;
export type ContentCreatePublishResponse = z.infer<typeof createPublishResponseSchema>;
export type ContentRetryPublishResponse = z.infer<typeof retryPublishResponseSchema>;
export type ContentTriggerRenderResponse = z.infer<typeof triggerRenderResponseSchema>;
export type TriggerRenderOptions = z.infer<typeof triggerRenderRequestSchema>;
export type TriggerCaptionsOptions = {
  mode?: string;
  backend?: z.infer<typeof settingsCaptionBackendSchema>;
  language?: string;
};
export type SaveCaptionsOptions = {
  captionsData: z.infer<typeof captionDocumentSchema> | null;
};

const triggerCaptionsResponseSchema = z.object({
  ok: z.boolean(),
  status: z.string(),
  id: z.string(),
  mode: z.string().optional(),
});

const saveCaptionsResponseSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  captionsData: captionDocumentSchema.nullable(),
});

export const contentSdk = {
  list(query: ContentQuery): Promise<ContentListResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, String(value));
      }
    });
    return client.get(
      `/api/content?${searchParams.toString()}`,
      "Failed to load content",
      contentListResponseSchema
    );
  },
  get(id: string): Promise<ContentItem> {
    return client.get(
      `/api/content/${id}`,
      "Failed to load content.",
      contentItemSchema
    );
  },
  create(payload: unknown): Promise<ContentItem> {
    return client.postJson(
      "/api/content",
      payload,
      "Failed to create content.",
      contentItemSchema
    );
  },
  update(id: string, payload: unknown): Promise<ContentItem> {
    return client.patchJson(
      `/api/content/${id}`,
      payload,
      "Failed to update content.",
      contentItemSchema
    );
  },
  remove(id: string, keepRenders = false): Promise<void> {
    const query = keepRenders ? "?keepRenders=1" : "";
    return client.del(`/api/content/${id}${query}`, "Failed to delete content.");
  },
  triggerRender(
    id: string,
    options?: TriggerRenderOptions
  ): Promise<ContentTriggerRenderResponse> {
    const parsedOptions = triggerRenderRequestSchema.parse(options ?? {});
    const payload =
      parsedOptions.backend || parsedOptions.mode ? parsedOptions : undefined;
    return client.postJson(
      `/api/content/${id}/render`,
      payload,
      "Render failed. Please check server logs.",
      triggerRenderResponseSchema
    );
  },
  cancelRender(id: string): Promise<void> {
    return client.del(`/api/content/${id}/render`, "Failed to cancel render.");
  },
  triggerCaptions(
    id: string,
    options?: TriggerCaptionsOptions
  ): Promise<z.infer<typeof triggerCaptionsResponseSchema>> {
    return client.postJson(
      `/api/content/${id}/captions`,
      options ?? {},
      "Caption generation failed.",
      triggerCaptionsResponseSchema
    );
  },
  saveCaptions(
    id: string,
    options: SaveCaptionsOptions
  ): Promise<z.infer<typeof saveCaptionsResponseSchema>> {
    return client.putJson(
      `/api/content/${id}/captions`,
      options,
      "Failed to save captions.",
      saveCaptionsResponseSchema
    );
  },
  progress(): Promise<ContentProgressResponse> {
    return client.get(
      "/api/content/progress",
      "Failed to load render progress.",
      renderProgressMapResponseSchema
    );
  },
  captionProgress(): Promise<ContentCaptionProgressResponse> {
    return client.get(
      "/api/content/captions/progress",
      "Failed to load caption progress.",
      captionProgressMapResponseSchema
    );
  },
  publishProgress(): Promise<ContentPublishProgressResponse> {
    return client.get(
      "/api/publishes/progress",
      "Failed to load publish progress.",
      publishProgressMapResponseSchema
    );
  },
  rescan(): Promise<ContentRescanResponse> {
    return client.postJson(
      "/api/content/rescan",
      undefined,
      "Rescan failed",
      rescanResponseSchema
    );
  },
  renders(id: string, page = 1, limit = 20): Promise<ContentRendersResponse> {
    return client.get(
      `/api/content/${id}/renders?page=${page}&limit=${limit}`,
      "Failed to load renders",
      rendersResponseSchema
    );
  },
  deleteRender(id: string, name: string): Promise<void> {
    return client.del(
      `/api/content/${id}/renders/${encodeURIComponent(name)}`,
      "Failed to delete render"
    );
  },
  listPublishes(id: string): Promise<ContentPublishesResponse> {
    return client.get(
      `/api/content/${id}/publishes`,
      "Failed to load publishes",
      contentPublishesResponseSchema
    );
  },
  createPublish(id: string, payload: unknown): Promise<ContentCreatePublishResponse> {
    return client.postJson(
      `/api/content/${id}/publishes`,
      payload,
      "Failed to create publish",
      createPublishResponseSchema
    );
  },
  deletePublish(id: string, publishId: string): Promise<void> {
    return client.del(
      `/api/content/${id}/publishes/${publishId}`,
      "Failed to delete publish"
    );
  },
  retryPublish(id: string, publishId: string): Promise<ContentRetryPublishResponse> {
    return client.postJson(
      `/api/content/${id}/publishes/${publishId}`,
      undefined,
      "Failed to retry publish",
      retryPublishResponseSchema
    );
  },
  assetUrl(id: string, type: "thumbnail" | "video" | "song" | "render", opts?: { name?: string; version?: string }) {
    const sp = new URLSearchParams();
    sp.set("type", type);
    if (opts?.name) sp.set("name", opts.name);
    if (opts?.version) sp.set("v", opts.version);
    return `/api/content/${id}/asset?${sp.toString()}`;
  },
};
