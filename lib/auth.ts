import { getUserBySession } from "@/lib/sqlite-state";

export const AUTH_COOKIE_NAME = "hanzi_session";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function isHttpsRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProto === "https" || new URL(request.url).protocol === "https:";
}

export function getAuthCookieOptions(request: Request, maxAge = AUTH_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsRequest(request),
    path: "/",
    maxAge,
  };
}

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
