import { handleGetProfile, handleUpdateProfile } from "@/lib/api/user/profile";

export const runtime = "nodejs";

export async function GET() {
  return handleGetProfile();
}

export async function PUT(request: Request) {
  return handleUpdateProfile(request);
}
