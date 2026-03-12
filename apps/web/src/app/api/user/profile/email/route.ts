import { handleRequestEmailChange } from "@/lib/api/user/email-change";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRequestEmailChange(request);
}
