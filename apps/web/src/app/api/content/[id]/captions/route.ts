import {
  ensureActorContentAccess,
  ensureActorPermission,
  resolveRequestActor,
} from "@/lib/auth/request-actor";
import { handleSaveCaptions, handleTriggerCaptions } from "@/lib/api/content/captions";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleTriggerCaptions(request, actor.userId, id);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "content:write");
  if (permissionError) return permissionError;
  const resourceError = ensureActorContentAccess(actor, id);
  if (resourceError) return resourceError;
  return handleSaveCaptions(request, actor.userId, id);
}
