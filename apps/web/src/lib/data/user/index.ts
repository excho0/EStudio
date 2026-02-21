import { z } from "zod";

/** User profile payload returned by profile endpoints. */
export const profilePayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  pendingEmail: z.string().nullable().optional(),
}).describe("User profile payload.");

/** OAuth connection list response payload. */
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
}).describe("Connections response.");

/** Generic ok response payload. */
export const okResponseSchema = z.object({
  ok: z.literal(true),
}).describe("OK response.");
