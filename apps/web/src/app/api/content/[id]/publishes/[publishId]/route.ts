import {
  handleDeletePublish,
  handleRetryPublish,
} from "@/lib/api/content/publish-item";
import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; publishId: string }> }
) {
  const params = await context.params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "publish:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, params.id);
  if (resourceError) return resourceError;
  return handleDeletePublish(request, params.id, params.publishId, actor.userId);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; publishId: string }> }
) {
  const params = await context.params;
  const { actor, error } = await resolveRequestActor(_request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "publish:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, params.id);
  if (resourceError) return resourceError;
  return handleRetryPublish(params.id, params.publishId, actor.userId);
}
