import { z } from "zod";

export const profilePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  pendingEmail: z.string().nullable().optional(),
});

export const connectionsResponseSchema = z.object({
  connections: z.array(
    z.object({
      provider: z.string(),
      providerAccountId: z.string().nullable(),
      profile: z
        .object({
          image: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
        })
        .nullable(),
    })
  ),
});

export const okResponseSchema = z.object({
  ok: z.literal(true),
});

