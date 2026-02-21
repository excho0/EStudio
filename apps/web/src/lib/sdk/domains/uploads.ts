import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import { okResponseSchema } from "@/lib/data/user";

const client = new ApiClient();
export type UploadDeleteDraftResponse = z.infer<typeof okResponseSchema>;

export const uploadsSdk = {
  deleteDraft(path: string): Promise<UploadDeleteDraftResponse> {
    return client.delJson(
      "/api/uploads",
      { path },
      "Failed to delete draft.",
      okResponseSchema
    );
  },
};
