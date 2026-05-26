"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn, UserPlus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useStudy } from "@/context/study-context";

type AuthMode = "login" | "register";

export function AuthPanel() {
  const { login, register } = useStudy();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result =
      mode === "login" ? await login(username, password) : await register(name, username, password);

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Не удалось войти.");
    }
  }

  return (
    <main className="relative z-10 grid min-h-screen place-items-center px-4 py-10">
      <div className="pointer-events-none fixed inset-0 soft-grid opacity-50" />
      <div className="glass-panel relative w-full max-w-md p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="brand-lockup">
            <span className="brand-mark">漢</span>
            <span>
              <span className="brand-name">Hanzi Flow</span>
              <span className="brand-kicker">Account</span>
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-7">
          <span className="pill w-fit">
            <LockKeyhole size={14} />
            Аккаунт
          </span>
          <h1 className="mt-4 text-2xl font-semibold">
            {mode === "login" ? "Вход в аккаунт" : "Создать аккаунт"}
          </h1>
          <p className="mt-2 text-sm muted-text">
            Карточки, прогресс, календарь занятий и статистика будут храниться на сервере за этим пользователем.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-[14px] bg-[rgba(var(--panel-strong),0.46)] p-1">
          <button
            type="button"
            className={mode === "login" ? "btn-primary py-2" : "btn-ghost py-2"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "btn-primary py-2" : "btn-ghost py-2"}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Регистрация
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Имя</span>
              <input
                value={name}
                className="rounded-[14px] px-3 py-3"
                placeholder="Например: Анна"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Никнейм</span>
            <input
              value={username}
              className="rounded-[14px] px-3 py-3"
              placeholder="eirkekrie"
              autoComplete="username"
              required
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Пароль</span>
            <input
              type="password"
              value={password}
              className="rounded-[14px] px-3 py-3"
              placeholder={mode === "register" ? "Минимум 8 символов" : "Ваш пароль"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {loading ? "Подождите..." : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </main>
  );
}
