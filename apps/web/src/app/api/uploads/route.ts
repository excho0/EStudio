import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleDeleteDraft, handleReadDraft, handleUploadDraft } from "@/lib/api/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "uploads:write");
  if (permissionError) return permissionError;
  return handleUploadDraft(request, actor.userId);
}

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "uploads:read");
  if (permissionError) return permissionError;
  return handleReadDraft(request, actor.userId);
}

export async function DELETE(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "uploads:write");
  if (permissionError) return permissionError;
  return handleDeleteDraft(request, actor.userId);
}
