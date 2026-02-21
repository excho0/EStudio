import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleRescanContent } from "@/lib/api/content/rescan";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleRescanContent(user.id);
}
