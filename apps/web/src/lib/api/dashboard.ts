import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/data/content";

export const handleGetDashboardStats = async (
  userId: string,
  request?: Request,
) => {
  const url = request ? new URL(request.url) : null;
  const rangeParam = url?.searchParams.get("range")?.trim().toLowerCase();
  const parsedWindowDays = Number(url?.searchParams.get("days") ?? "7");
  const range =
    rangeParam === "all"
      ? "all"
      : Number.isFinite(parsedWindowDays)
        ? parsedWindowDays
        : 7;
  const stats = await getDashboardStats(userId, range);
  return NextResponse.json(stats);
};
