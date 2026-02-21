import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleGetRenderProgress } from "@/lib/api/content/progress";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleGetRenderProgress(user.id);
}
