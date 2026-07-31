import { ScoreRing } from "@/components/ScoreRing";
import { StatusEditor } from "@/components/StatusEditor";

const CATEGORY_LABELS: Record<string, string> = { tech: "Tech", consulting: "Consulting", vc_pe: "VC/PE" };
const LEVEL_LABELS: Record<string, string> = { internship: "Internship", new_grad: "New grad" };

// Our score's rationale is literally "Matched keywords: x, y, z" (see lib/match.ts) — parsing it
// back into chips reuses that real signal instead of the Figma reference's fabricated reason list.
function reasonChips(rationale: string | null): string[] {
  const prefix = "Matched keywords: ";
  if (!rationale?.startsWith(prefix)) return [];
  return rationale
    .slice(prefix.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function formatDate(d: Date | string | null) {
  if (!d) return "date unknown";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  category: string | null;
  level: string | null;
  url: string;
  postedAt: Date | string | null;
  status: string | null;
  score: number | null;
  rationale: string | null;
};

export function RecommendationCard({ job }: { job: Job }) {
  const chips = reasonChips(job.rationale);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-accent/15 bg-surface px-4 py-3.5 transition-colors hover:border-accent/30">
      {job.score !== null ? <ScoreRing score={job.score} /> : <div className="h-12 w-12 shrink-0" />}

      <div className="min-w-0 flex-1">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-medium text-foreground hover:underline"
        >
          {job.title}
        </a>
        <p className="truncate text-xs text-foreground-muted">
          {job.company} · {job.location ?? "remote/unspecified"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {job.level && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {LEVEL_LABELS[job.level] ?? job.level}
            </span>
          )}
          {job.category && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {CATEGORY_LABELS[job.category] ?? job.category}
            </span>
          )}
          {chips.map((c) => (
            <span key={c} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-foreground-muted">
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <p className="text-[10px] text-foreground-muted">posted {formatDate(job.postedAt)}</p>
        <StatusEditor jobId={job.id} status={job.status} />
      </div>
    </div>
  );
}
