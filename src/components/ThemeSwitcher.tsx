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
    <select
      value={theme}
      onChange={(e) => change(e.target.value as ThemeId)}
      className="rounded border border-accent/30 bg-background px-2 py-1 text-xs text-foreground-muted"
      aria-label="Theme"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
