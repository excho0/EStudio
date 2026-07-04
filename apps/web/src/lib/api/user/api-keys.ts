import { NextResponse } from "next/server";

import {
  apiKeyCreateResponseSchema,
  apiKeyListResponseSchema,
  apiKeyUpdateResponseSchema,
  createUserApiKey,
  deleteUserApiKey,
  listUserApiKeys,
  updateUserApiKey,
} from "@/lib/data/api-keys";

export async function handleListUserApiKeys(userId: string) {
  const apiKeys = await listUserApiKeys(userId);
  return NextResponse.json(apiKeyListResponseSchema.parse({ apiKeys }));
}

export async function handleCreateUserApiKey(request: Request, userId: string) {
  const payload = await request.json().catch(() => null);
  const result = await createUserApiKey(userId, payload);
  return NextResponse.json(apiKeyCreateResponseSchema.parse(result), { status: 201 });
}

export async function handleUpdateUserApiKey(
  request: Request,
  userId: string,
  apiKeyId: string
) {
  const payload = await request.json().catch(() => null);
  const apiKey = await updateUserApiKey(userId, apiKeyId, payload);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }
  return NextResponse.json(apiKeyUpdateResponseSchema.parse({ apiKey }));
}

export async function handleDeleteUserApiKey(userId: string, apiKeyId: string) {
  await deleteUserApiKey(userId, apiKeyId);
  return NextResponse.json({ ok: true });
}
