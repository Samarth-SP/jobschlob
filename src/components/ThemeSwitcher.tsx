"use client";

import { useEffect, useState } from "react";
import { THEMES, DEFAULT_THEME, type ThemeId } from "@/lib/themes";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as ThemeId | null;
    if (current) setTheme(current);
  }, []);

  function change(next: ThemeId) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <div className="relative inline-flex h-6 w-6 items-center justify-center" title="Theme">
      <span aria-hidden className="pointer-events-none text-base leading-none">
        🎨
      </span>
      <select
        value={theme}
        onChange={(e) => change(e.target.value as ThemeId)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Theme"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
