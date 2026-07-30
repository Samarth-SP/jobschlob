// Hand-rolled horizontal-bar funnel — same complexity class as the heatmap, no charting
// dependency needed for a handful of decreasing bars. Single series, so one color, no legend.
const STAGES = ["interested", "applied", "oa", "interview", "offer"] as const;

export function FunnelChart({ counts }: { counts: { status: string; jobCount: number }[] }) {
  const byStatus = new Map(counts.map((c) => [c.status, c.jobCount]));
  const max = Math.max(1, ...STAGES.map((s) => byStatus.get(s) ?? 0));

  return (
    <div className="flex flex-col gap-2">
      {STAGES.map((stage) => {
        const value = byStatus.get(stage) ?? 0;
        const pct = Math.max(4, (value / max) * 100);
        return (
          <div key={stage} className="flex items-center gap-3 text-sm">
            <div className="w-24 shrink-0 text-foreground-muted">{stage.replace("_", " ")}</div>
            <div className="flex-1 rounded bg-surface">
              <div
                className="h-5 rounded bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-8 shrink-0 text-right text-foreground">{value}</div>
          </div>
        );
      })}
    </div>
  );
}
