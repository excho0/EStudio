import { z } from "zod";

/** Meta providers response payload. */
export const metaProvidersResponseSchema = z.object({
  oauthProviders: z.array(z.string()),
  emailEnabled: z.boolean(),
}).describe("Meta providers response.");
