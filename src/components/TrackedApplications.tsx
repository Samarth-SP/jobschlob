"use client";

import { useState } from "react";
import { StatusEditor } from "@/components/StatusEditor";
import { statusClasses } from "@/lib/status-style";

type HistoryEvent = { status: string; changedAt: Date | string };

type TrackedJob = {
  job: { id: string; title: string; company: string; location: string | null; url: string };
  status: string | null;
  notes: string | null;
  history: HistoryEvent[];
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function label(status: string) {
  return status.replace("_", " ");
}

export function TrackedApplications({ items }: { items: TrackedJob[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) return <p className="text-foreground-muted">Nothing tracked yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ job, status, notes, history }) => {
        const isOpen = expanded === job.id;
        const c = statusClasses(status ?? "interested");
        return (
          <li key={job.id} className="overflow-hidden rounded-xl border border-accent/15 bg-surface">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : job.id)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{job.title}</p>
                <p className="truncate text-sm text-foreground-muted">
                  {job.company} · {job.location ?? "remote/unspecified"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${c.text} ${c.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                  {label(status ?? "interested")}
                </span>
                <span
                  className="text-foreground-muted transition-transform duration-150"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  ▾
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-accent/10 px-4 pb-4 pt-3">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-foreground-muted hover:text-accent hover:underline"
                  >
                    View posting ↗
                  </a>
                  <StatusEditor jobId={job.id} status={status} />
                </div>

                {notes && <p className="mb-3 text-xs text-foreground-muted">{notes}</p>}

                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-foreground-muted/70">
                  Status history
                </p>
                <div className="flex flex-col">
                  {history.length === 0 && <p className="text-xs text-foreground-muted">No history yet.</p>}
                  {history.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-1 flex shrink-0 flex-col items-center">
                        <span className={`h-2 w-2 rounded-full ${statusClasses(ev.status).dot}`} />
                        {i < history.length - 1 && (
                          <span className="mt-1 w-px flex-1 bg-accent/15" style={{ minHeight: "18px" }} />
                        )}
                      </div>
                      <div className="pb-3">
                        <span className={`text-xs font-medium ${statusClasses(ev.status).text}`}>{label(ev.status)}</span>
                        <span className="ml-2 text-[10px] text-foreground-muted">{fmt(ev.changedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
