import { z } from "zod";
import { ApiClient } from "@/lib/sdk/client";
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
export type ContentRescanResponse = z.infer<typeof rescanResponseSchema>;
export type ContentPublishesResponse = z.infer<
  typeof contentPublishesResponseSchema
>;
export type ContentCreatePublishResponse = z.infer<typeof createPublishResponseSchema>;
export type ContentRetryPublishResponse = z.infer<typeof retryPublishResponseSchema>;
export type ContentTriggerRenderResponse = z.infer<typeof triggerRenderResponseSchema>;
export type TriggerRenderOptions = z.infer<typeof triggerRenderRequestSchema>;

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
  progress(): Promise<ContentProgressResponse> {
    return client.get(
      "/api/content/progress",
      "Failed to load render progress.",
      renderProgressMapResponseSchema
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
