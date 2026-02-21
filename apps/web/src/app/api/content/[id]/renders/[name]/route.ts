import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleDeleteRender } from "@/lib/api/content/renders";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleDeleteRender(user.id, id, name);
}
