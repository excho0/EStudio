import { NextResponse } from "next/server";
import { getRenderProgressSnapshot } from "@/lib/socket/manager";

export const handleGetRenderProgress = async (userId: string) => {
  return NextResponse.json({
    items: await getRenderProgressSnapshot(userId),
  });
};
