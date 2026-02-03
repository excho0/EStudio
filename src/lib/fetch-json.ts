export const fetchJson = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = "Request failed."
): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // ignore parse errors, use fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
};
