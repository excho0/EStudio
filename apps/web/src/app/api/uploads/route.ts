import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleDeleteDraft, handleReadDraft, handleUploadDraft } from "@/lib/api/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleUploadDraft(request, user.id);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleReadDraft(request, user.id);
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleDeleteDraft(request, user.id);
}
