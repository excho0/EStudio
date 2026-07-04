import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleRescanContent } from "@/lib/api/content/rescan";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  return handleRescanContent(actor.userId);
}
