type ApiErrorPayload = {
  error?: string;
  message?: string;
};

import { confirmSessionExpired, redirectToLoginOnce } from "@/lib/auth/client-sync";

const formatApiError = (payload: ApiErrorPayload | null, fallbackMessage: string) => {
  return (
    (typeof payload?.error === "string" && payload.error.trim()) ||
    (typeof payload?.message === "string" && payload.message.trim()) ||
    fallbackMessage
  );
};

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const throwForNonOkResponse = async (
  response: Response,
  fallbackMessage = "Request failed."
) => {
  if (response.ok) return;
  let message = fallbackMessage;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    message = formatApiError(payload, fallbackMessage);
  } catch {
    // ignore parse errors, use fallback
  }
  if (response.status === 401) {
    const sessionExpired = await confirmSessionExpired();
    if (sessionExpired) {
      redirectToLoginOnce();
    }
  }
  throw new HttpError(message, response.status);
};

export const fetchJson = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = "Request failed."
): Promise<T> => {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
  });
  await throwForNonOkResponse(response, fallbackMessage);
  return (await response.json()) as T;
};
