import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleGetDashboardStats } from "@/lib/api/dashboard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleGetDashboardStats(user.id, request);
}

