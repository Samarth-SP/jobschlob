// Hand-rolled GitHub-style calendar heatmap — single-hue sequential ramp (surface -> accent),
// no charting dependency for a 7xN grid of colored cells. Mixed via color-mix() rather than
// hardcoded hex so it adapts to whichever theme is active (see globals.css / ThemeSwitcher).
const LEVELS = [0, 25, 50, 75, 100].map(
  (pct) => `color-mix(in srgb, var(--surface), var(--accent) ${pct}%)`,
);

function levelFor(count: number) {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function Heatmap({ counts, weeks = 12 }: { counts: { day: string; count: number }[]; weeks?: number }) {
  const byDay = new Map(counts.map((c) => [c.day, c.count]));

  const days: { date: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = weeks * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  const columns: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) columns.push(days.slice(i, i + 7));

  return (
    <div className="flex gap-1 overflow-x-auto">
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col gap-1">
          {col.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} application${day.count === 1 ? "" : "s"}`}
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: LEVELS[levelFor(day.count)] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
