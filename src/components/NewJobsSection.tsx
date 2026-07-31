"use client";

import { useMemo, useRef, useState } from "react";
import { RecommendationCard } from "@/components/RecommendationCard";
import { splitLocations } from "@/lib/locations";
import type { DashboardFilters } from "@/lib/dashboard-filters";

const POPULAR_LOCATION_COUNT = 8;

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

const CATEGORY_LABELS: Record<string, string> = { tech: "Tech", consulting: "Consulting", vc_pe: "VC/PE" };
const LEVEL_LABELS: Record<string, string> = { internship: "Internship", new_grad: "New grad" };

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function NewJobsSection({ jobs, initialFilters }: { jobs: Job[]; initialFilters: DashboardFilters }) {
  const [minScore, setMinScore] = useState(initialFilters.minScore ?? 0);
  const [locations, setLocations] = useState<string[]>(initialFilters.locations ?? []);
  const [company, setCompany] = useState(initialFilters.company ?? "");
  const [categories, setCategories] = useState<string[]>(initialFilters.categories ?? []);
  const [levels, setLevels] = useState<string[]>(initialFilters.levels ?? []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      for (const loc of splitLocations(j.location)) counts.set(loc, (counts.get(loc) ?? 0) + 1);
    }
    return counts;
  }, [jobs]);

  const popularLocations = useMemo(
    () =>
      [...locationCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, POPULAR_LOCATION_COUNT)
        .map(([loc]) => loc),
    [locationCounts],
  );

  // Selected locations stay visible as bubbles even if they fall out of the "popular" set (e.g.
  // added via the dropdown below), so toggling one off doesn't require re-finding it in the list.
  const visibleLocations = useMemo(
    () => [...new Set([...popularLocations, ...locations])],
    [popularLocations, locations],
  );

  const remainingLocations = useMemo(
    () => [...locationCounts.keys()].filter((l) => !visibleLocations.includes(l)).sort(),
    [locationCounts, visibleLocations],
  );

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

  function update(next: Partial<DashboardFilters>) {
    const merged = { minScore, locations, company, categories, levels, ...next };
    if (next.minScore !== undefined) setMinScore(next.minScore);
    if (next.locations !== undefined) setLocations(next.locations);
    if (next.company !== undefined) setCompany(next.company);
    if (next.categories !== undefined) setCategories(next.categories);
    if (next.levels !== undefined) setLevels(next.levels);
    persist(merged);
  }

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (minScore > 0 && (job.score === null || job.score < minScore)) return false;
      if (locations.length && !splitLocations(job.location).some((l) => locations.includes(l))) return false;
      if (company && !job.company.toLowerCase().includes(company.toLowerCase())) return false;
      if (categories.length && !(job.category && categories.includes(job.category))) return false;
      if (levels.length && !(job.level && levels.includes(job.level))) return false;
      return true;
    });
  }, [jobs, minScore, locations, company, categories, levels]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4 text-sm">
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
          placeholder="Company contains…"
          value={company}
          onChange={(e) => update({ company: e.target.value })}
          className="rounded border border-accent/30 bg-background px-2 py-1 text-foreground"
        />

        <div className="flex flex-col gap-1">
          <span className="text-foreground-muted">Type</span>
          <div className="flex gap-3">
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1 text-foreground">
                <input
                  type="checkbox"
                  checked={categories.includes(value)}
                  onChange={() => update({ categories: toggle(categories, value) })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-foreground-muted">Level</span>
          <div className="flex gap-3">
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1 text-foreground">
                <input
                  type="checkbox"
                  checked={levels.includes(value)}
                  onChange={() => update({ levels: toggle(levels, value) })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {visibleLocations.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-foreground-muted">Locations</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleLocations.map((loc) => {
                const active = locations.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => update({ locations: toggle(locations, loc) })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-accent/20 bg-background text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
              {remainingLocations.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && update({ locations: toggle(locations, e.target.value) })}
                  className="max-w-40 rounded-full border border-accent/20 bg-background px-2.5 py-1 text-xs text-foreground-muted"
                >
                  <option value="">+ Add location</option>
                  {remainingLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((job) => (
          <RecommendationCard key={job.id} job={job} />
        ))}
        {filtered.length === 0 && (
          <p className="text-foreground-muted">
            {jobs.length === 0 ? "No new jobs — run the ingest script." : "No jobs match these filters."}
          </p>
        )}
      </div>
    </div>
  );
}
