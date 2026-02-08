import { handleGetProviderAvatar } from "@/lib/api/user/avatar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleGetProviderAvatar(request);
}
