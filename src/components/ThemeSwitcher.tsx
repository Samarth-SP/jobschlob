"use client";

import { useState } from "react";
import { THEMES, DEFAULT_THEME, type ThemeId } from "@/lib/themes";

// Reads whatever theme layout.tsx's blocking inline script already applied to <html> before
// first paint. Server-rendered markup can't know this (no localStorage access), so this
// necessarily disagrees with the SSR output whenever the saved theme isn't the default — that's
// expected, not a bug, hence suppressHydrationWarning on the <select> below. The previous version
// initialized to DEFAULT_THEME and corrected via a post-mount effect, which meant the dropdown
// visibly showed "light" for a moment even when the page itself had already rendered dark.
function currentTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return (document.documentElement.getAttribute("data-theme") as ThemeId | null) ?? DEFAULT_THEME;
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(currentTheme);

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
        suppressHydrationWarning
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
