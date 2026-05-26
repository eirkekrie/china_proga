import { getUserBySession } from "@/lib/sqlite-state";

export const AUTH_COOKIE_NAME = "hanzi_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
};

export function getSessionIdFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return undefined;
  }

  return decodeURIComponent(sessionCookie.slice(AUTH_COOKIE_NAME.length + 1));
}

export function getAuthenticatedUser(request: Request) {
  return getUserBySession(getSessionIdFromRequest(request));
}
