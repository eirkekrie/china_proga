"use client";

import { Moon, Sun } from "lucide-react";
import { useStudy } from "@/context/study-context";

export function ThemeToggle() {
  const { hydrated, theme, setTheme } = useStudy();

  if (!hydrated) {
    return (
      <button type="button" className="theme-toggle" disabled aria-label="Тема загружается">
        <Sun size={18} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
