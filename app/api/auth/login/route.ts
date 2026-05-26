import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth";
import { createSession, verifyUserCredentials } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string; password?: string };
    const email = payload.email?.trim() ?? "";
    const password = payload.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Введите email и пароль." }, { status: 400 });
    }

    const user = verifyUserCredentials(email, password);

    if (!user) {
      return NextResponse.json({ error: "Неверный email или пароль." }, { status: 401 });
    }

    const session = createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE_NAME, session.id, authCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Не удалось выполнить вход." }, { status: 400 });
  }
}
