import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getAuthCookieOptions } from "@/lib/auth";
import { createSession, verifyUserCredentials } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = payload.username?.trim() ?? "";
    const password = payload.password ?? "";

    if (!username || !password) {
      return NextResponse.json({ error: "Введите никнейм и пароль." }, { status: 400 });
    }

    const user = verifyUserCredentials(username, password);

    if (!user) {
      return NextResponse.json({ error: "Неверный никнейм или пароль." }, { status: 401 });
    }

    const session = createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE_NAME, session.id, getAuthCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "Не удалось выполнить вход." }, { status: 400 });
  }
}
