import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    publishTargets: [
      {
        id: "youtube",
        label: "YouTube",
        status: "coming_soon",
      },
    ],
  });
}
