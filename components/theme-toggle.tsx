"use client";

import { useStudy } from "@/context/study-context";

export function ThemeToggle() {
  const { theme, setTheme } = useStudy();

  return (
    <button
      type="button"
      className="btn-secondary px-4 py-2 text-sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    </button>
  );
}
