import {
  handleCreatePublish,
  handleListPublishes,
} from "@/lib/api/content/publishes";
import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "publish:read");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, params.id);
  if (resourceError) return resourceError;
  return handleListPublishes(request, params.id, actor.userId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "publish:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, params.id);
  if (resourceError) return resourceError;
  return handleCreatePublish(request, params.id, actor.userId);
}
