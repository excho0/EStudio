import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleGetRenderProgress } from "@/lib/api/content/progress";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:read");
  if (permissionError) return permissionError;
  return handleGetRenderProgress(actor.userId);
}
