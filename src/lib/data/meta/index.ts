import { z } from "zod";

export const metaProvidersResponseSchema = z.object({
  oauthProviders: z.array(z.string()),
  emailEnabled: z.boolean(),
});

