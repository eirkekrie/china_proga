"use client";

import { useStudy } from "@/context/study-context";

export function ThemeToggle() {
  const { hydrated, theme, setTheme } = useStudy();

  if (!hydrated) {
    return (
      <button type="button" className="theme-toggle" disabled>
        Тема
      </button>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
    >
      {theme === "dark" ? "Светлая" : "Тёмная"}
    </button>
  );
}
