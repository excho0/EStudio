"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const AUTH_CHANGED_EVENT = "app:auth-changed";
export const AUTH_EXPIRED_EVENT = "app:auth-expired";

const AUTH_QUERY_PREFIXES = new Set([
  "profile",
  "profile-connections",
  "publish-providers",
  "publish-provider",
]);

let authRedirectInFlight = false;
let authSessionCheckInFlight: Promise<boolean> | null = null;

const getQueryPrefix = (queryKey: QueryKey) =>
  Array.isArray(queryKey) && typeof queryKey[0] === "string" ? queryKey[0] : null;

export const invalidateAuthQueries = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const prefix = getQueryPrefix(query.queryKey);
      return prefix ? AUTH_QUERY_PREFIXES.has(prefix) : false;
    },
  });
};

export const removeAuthQueries = (queryClient: QueryClient) => {
  queryClient.removeQueries({
    predicate: (query) => {
      const prefix = getQueryPrefix(query.queryKey);
      return prefix ? AUTH_QUERY_PREFIXES.has(prefix) : false;
    },
  });
};

export const notifyAuthChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
};

export const confirmSessionExpired = async () => {
  if (typeof window === "undefined") return true;
  if (authSessionCheckInFlight) {
    return authSessionCheckInFlight;
  }

  authSessionCheckInFlight = fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  })
    .then(async (response) => {
      if (!response.ok) return true;
      const payload = (await response.json()) as { user?: unknown } | null;
      const hasUser = Boolean(payload?.user);
      if (hasUser) {
        notifyAuthChanged();
      }
      return !hasUser;
    })
    .catch(() => false)
    .finally(() => {
      authSessionCheckInFlight = null;
    });

  return authSessionCheckInFlight;
};

export const redirectToLoginOnce = () => {
  if (typeof window === "undefined" || authRedirectInFlight) return;

  const { pathname, search, hash, origin } = window.location;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return;
  }

  authRedirectInFlight = true;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));

  const callbackUrl = `${pathname}${search}${hash}`;
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  window.location.replace(loginUrl.toString());
};
