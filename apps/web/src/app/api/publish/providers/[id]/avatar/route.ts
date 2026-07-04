import { handleGetPublishProviderAvatar } from "@/lib/api/publish/provider-item";
import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { actor, error } = await resolveRequestActor(_request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "publish:read");
  if (permissionError) return permissionError;
  return handleGetPublishProviderAvatar(params.id, actor.userId);
}
