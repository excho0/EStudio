import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/library",
  "/upload",
  "/metrics",
  "/renders",
  "/publishes",
  "/edit",
  "/settings",
];

const isProtectedPath = (pathname: string) =>
  PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

const hasSessionCookie = (request: NextRequest) => {
  return [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ].some((name) => Boolean(request.cookies.get(name)?.value));
};

export default function proxy(request: NextRequest) {
  const { nextUrl } = request;

  if (!isProtectedPath(nextUrl.pathname) || hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", nextUrl);
  const callbackUrl = `${nextUrl.pathname}${nextUrl.search}`;
  loginUrl.searchParams.set("callbackUrl", callbackUrl);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/library/:path*",
    "/upload/:path*",
    "/metrics/:path*",
    "/renders/:path*",
    "/publishes/:path*",
    "/edit/:path*",
    "/settings/:path*",
  ],
};
