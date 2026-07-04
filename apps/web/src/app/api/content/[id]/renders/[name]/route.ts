import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";
import { handleDeleteRender } from "@/lib/api/content/renders";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const { actor, error } = await resolveRequestActor(_request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleDeleteRender(actor.userId, id, name);
}
