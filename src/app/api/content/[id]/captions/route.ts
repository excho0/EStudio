import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleTriggerCaptions } from "@/lib/api/content/captions";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleTriggerCaptions(request, user.id, id);
}

