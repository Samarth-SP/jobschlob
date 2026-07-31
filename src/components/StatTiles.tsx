const CLOSED = new Set(["rejected", "ghosted", "archived"]);
const INTERVIEWING = new Set(["oa", "interview"]);

export function StatTiles({ tracked }: { tracked: { status: string | null }[] }) {
  const tiles = [
    { label: "Tracked", value: tracked.length },
    { label: "Active", value: tracked.filter((t) => !CLOSED.has(t.status ?? "")).length },
    { label: "Interviewing", value: tracked.filter((t) => INTERVIEWING.has(t.status ?? "")).length },
    { label: "Offers", value: tracked.filter((t) => t.status === "offer").length },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-accent/15 bg-surface p-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-foreground-muted/70">{t.label}</p>
          <p className="text-2xl font-semibold text-foreground">{t.value}</p>
        </div>
      ))}
    </div>
  );
}
