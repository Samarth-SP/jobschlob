// Ids must match the `[data-theme="..."]` blocks in globals.css.
export const THEMES = [
  { id: "jobschlob-light", label: "jobschlob (light)" },
  { id: "jobschlob-dark", label: "jobschlob (dark)" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "nord", label: "Nord" },
  { id: "dracula", label: "Dracula" },
  { id: "monkeytype", label: "Monkeytype" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "jobschlob-light";
