"use client";

import { useMemo, useRef, useState } from "react";
import { StatusEditor } from "@/components/StatusEditor";
import type { DashboardFilters } from "@/lib/dashboard-filters";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  postedAt: Date | string | null;
  status: string | null;
  score: number | null;
};

function formatDate(d: Date | string | null) {
  if (!d) return "date unknown";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function NewJobsSection({ jobs, initialFilters }: { jobs: Job[]; initialFilters: DashboardFilters }) {
  const [minScore, setMinScore] = useState(initialFilters.minScore ?? 0);
  const [location, setLocation] = useState(initialFilters.location ?? "");
  const [company, setCompany] = useState(initialFilters.company ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(next: DashboardFilters) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/dashboard/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    }, 400);
  }

  function update(next: { minScore?: number; location?: string; company?: string }) {
    const merged = {
      minScore: next.minScore ?? minScore,
      location: next.location ?? location,
      company: next.company ?? company,
    };
    if (next.minScore !== undefined) setMinScore(next.minScore);
    if (next.location !== undefined) setLocation(next.location);
    if (next.company !== undefined) setCompany(next.company);
    persist(merged);
  }

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (minScore > 0 && (job.score === null || job.score < minScore)) return false;
      if (location && !(job.location ?? "").toLowerCase().includes(location.toLowerCase())) return false;
      if (company && !job.company.toLowerCase().includes(company.toLowerCase())) return false;
      return true;
    });
  }, [jobs, minScore, location, company]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-foreground-muted">
          Min match
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => update({ minScore: Number(e.target.value) })}
            className="w-16 rounded border border-accent/30 bg-background px-2 py-1 text-foreground"
          />
        </label>
        <input
          type="text"
          placeholder="Location contains…"
          value={location}
          onChange={(e) => update({ location: e.target.value })}
          className="rounded border border-accent/30 bg-background px-2 py-1 text-foreground"
        />
        <input
          type="text"
          placeholder="Company contains…"
          value={company}
          onChange={(e) => update({ company: e.target.value })}
          className="rounded border border-accent/30 bg-background px-2 py-1 text-foreground"
        />
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between gap-4 rounded border border-accent/20 bg-surface p-3"
          >
            <div>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                {job.title}
              </a>
              <div className="text-sm text-foreground-muted">
                {job.company} · {job.location ?? "remote/unspecified"} · posted {formatDate(job.postedAt)}
                {job.score !== null && <> · match {job.score}</>}
              </div>
            </div>
            <StatusEditor
              jobId={job.id}
              status={job.status}
            />
          </li>
        ))}
        {filtered.length === 0 && (
          <p className="text-foreground-muted">
            {jobs.length === 0 ? "No new jobs — run the ingest script." : "No jobs match these filters."}
          </p>
        )}
      </ul>
    </div>
  );
}
