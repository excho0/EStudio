type ApiErrorPayload = {
  error?: string;
  message?: string;
};

const formatApiError = (payload: ApiErrorPayload | null, fallbackMessage: string) => {
  return (
    (typeof payload?.error === "string" && payload.error.trim()) ||
    (typeof payload?.message === "string" && payload.message.trim()) ||
    fallbackMessage
  );
};

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
  throw new Error(message);
};

export const fetchJson = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = "Request failed."
): Promise<T> => {
  const response = await fetch(input, init);
  await throwForNonOkResponse(response, fallbackMessage);
  return (await response.json()) as T;
};
