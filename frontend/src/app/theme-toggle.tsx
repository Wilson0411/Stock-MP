"use client";

import { useEffect } from "react";

type ThemeMode = "light" | "dark";

const storageKey = "stockmp-theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

function resolveTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem(storageKey);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  useEffect(() => {
    applyTheme(resolveTheme());
  }, []);

  const handleToggle = () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="inline-flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium shadow-[0_12px_30px_rgba(17,17,17,0.08)] transition-transform hover:-translate-y-0.5"
      aria-label="切換日間與夜間模式"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-chip text-base">
        ◐
      </span>
      <span>日間 / 夜間</span>
    </button>
  );
}
