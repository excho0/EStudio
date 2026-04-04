import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import { okResponseSchema } from "@/lib/data/user";
import { throwForNonOkResponse } from "@/lib/http/fetch-json";

const client = new ApiClient();
export type UploadDeleteDraftResponse = z.infer<typeof okResponseSchema>;
const uploadDraftResponseSchema = z.object({
  path: z.string(),
  kind: z.enum(["thumbnail", "video", "song"]),
  expiresAt: z.number(),
});
export type UploadDraftResponse = z.infer<typeof uploadDraftResponseSchema>;

export const uploadsSdk = {
  async uploadDraft(
    file: File,
    kind: "thumbnail" | "video" | "song"
  ): Promise<UploadDraftResponse> {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("kind", kind);
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    await throwForNonOkResponse(response, "Failed to upload draft.");
    return uploadDraftResponseSchema.parse(await response.json());
  },
  deleteDraft(path: string): Promise<UploadDeleteDraftResponse> {
    return client.delJson(
      "/api/uploads",
      { path },
      "Failed to delete draft.",
      okResponseSchema
    );
  },
  assetUrl(path: string, version?: string) {
    const searchParams = new URLSearchParams({ path });
    if (version) searchParams.set("v", version);
    return `/api/uploads?${searchParams.toString()}`;
  },
};
