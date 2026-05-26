import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth";
import { copyLegacyStateToUser, createSession, createUser, getUserCount } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string; name?: string; password?: string };
    const email = payload.email?.trim() ?? "";
    const name = payload.name?.trim() || email.split("@")[0] || "Пользователь";
    const password = payload.password ?? "";

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Введите корректный email." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не короче 8 символов." }, { status: 400 });
    }

    const shouldCopyLegacyState = getUserCount() === 0;
    const user = createUser({ email, name, password });

    if (!user) {
      return NextResponse.json({ error: "Аккаунт с таким email уже существует." }, { status: 409 });
    }

    if (shouldCopyLegacyState) {
      copyLegacyStateToUser(user.id);
    }

    const session = createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(AUTH_COOKIE_NAME, session.id, authCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Не удалось создать аккаунт." }, { status: 400 });
  }
}
