// eslint-disable-next-line import/no-unresolved
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth/request-actor";
import { createEstudioMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, mcp-session-id",
};

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

async function handleMcpRequest(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return withCors(error);
  if (!actor) {
    return withCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  const server = createEstudioMcpServer({ actor, request });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      authInfo: {
        clientId: actor.kind === "api-key" ? actor.apiKey.id : actor.userId,
        scopes: actor.kind === "api-key" ? actor.apiKey.permissions : ["session"],
        token: actor.kind === "api-key" ? actor.apiKey.tokenPrefix : "session",
      },
    });
    return withCors(response);
  } finally {
    await server.close().catch(() => undefined);
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
