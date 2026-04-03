import { NextResponse } from "next/server";
import { getCaptionProgressSnapshot } from "@/lib/socket/manager";

export const handleGetCaptionProgress = async (userId: string) => {
  return NextResponse.json({
    items: await getCaptionProgressSnapshot(userId),
  });
};
