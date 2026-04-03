import { NextResponse } from "next/server";
import { getPublishProgressSnapshot } from "@/lib/socket/manager";

export const handleGetPublishProgress = async (userId: string) => {
  return NextResponse.json({
    items: await getPublishProgressSnapshot(userId),
  });
};
