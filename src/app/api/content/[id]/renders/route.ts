import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleListRenders } from "@/lib/api/content/renders";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleListRenders(request, user.id, id);
}
