import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions } from "@/lib/auth";
import { copyLegacyStateToUser, createSession, createUser, getUserCount } from "@/lib/sqlite-state";

export const dynamic = "force-dynamic";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { username?: string; name?: string; password?: string };
    const username = payload.username?.trim() ?? "";
    const name = payload.name?.trim() || username || "Пользователь";
    const password = payload.password ?? "";

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        { error: "Никнейм должен быть 3-32 символа: латиница, цифры, _ или -." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не короче 8 символов." }, { status: 400 });
    }

    const shouldCopyLegacyState = getUserCount() === 0;
    const user = createUser({ username, name, password });

    if (!user) {
      return NextResponse.json({ error: "Аккаунт с таким никнеймом уже существует." }, { status: 409 });
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
