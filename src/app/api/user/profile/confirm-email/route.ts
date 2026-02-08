import { handleConfirmEmail } from "@/lib/api/user/confirm-email";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleConfirmEmail(request);
}
