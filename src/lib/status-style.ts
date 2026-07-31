// Groups the 9 tracked-job statuses into 3 visual buckets. No dedicated status-color tokens exist
// in globals.css (only background/surface/foreground/accent/pop), and adding red/amber/green
// hexes per status would both violate the "never hardcode a literal color" rule and clash across
// the 6 theme presets — so this reuses accent (progressing) vs. dimmed foreground-muted (closed)
// instead of inventing a new palette.
const PROGRESSING = new Set(["oa", "interview", "offer"]);
const CLOSED = new Set(["rejected", "ghosted", "archived"]);

export function statusClasses(status: string): { text: string; dot: string; bg: string } {
  if (PROGRESSING.has(status)) return { text: "text-accent", dot: "bg-accent", bg: "bg-accent/10" };
  if (CLOSED.has(status)) return { text: "text-foreground-muted/60", dot: "bg-foreground-muted/40", bg: "bg-surface" };
  return { text: "text-foreground-muted", dot: "bg-foreground-muted", bg: "bg-surface" };
}
