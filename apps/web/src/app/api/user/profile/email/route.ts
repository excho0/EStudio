import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleRequestEmailChange } from "@/lib/api/user/email-change";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "profile:write");
  if (permissionError) return permissionError;
  return handleRequestEmailChange(request, actor.userId);
}
