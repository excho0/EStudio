import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";
import { handleListRenders } from "@/lib/api/content/renders";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:read");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleListRenders(request, actor.userId, id);
}
