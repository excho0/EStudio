import {
  handleDeleteConnection,
  handleGetConnections,
} from "@/lib/api/user/connections";

export const runtime = "nodejs";

export async function GET() {
  return handleGetConnections();
}

export async function DELETE(request: Request) {
  return handleDeleteConnection(request);
}
