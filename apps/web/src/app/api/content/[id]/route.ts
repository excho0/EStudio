import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";
import {
  handleDeleteContentItem,
  handleGetContentItem,
  handlePatchContentItem,
} from "@/lib/api/content/item";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(_request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "content:read");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleGetContentItem(actor.userId, id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handlePatchContentItem(request, actor.userId, id);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleDeleteContentItem(request, actor.userId, id);
}
