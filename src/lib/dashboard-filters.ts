export type DashboardFilters = {
  minScore?: number;
  locations?: string[];
  areas?: string[]; // coarse metro groupings — see lib/locations.ts LOCATION_AREAS
  company?: string;
  categories?: string[];
  levels?: string[];
  degreeLevels?: string[]; // 'bachelors' | 'masters' | 'phd' — see lib/degree-heuristic.ts
  // Opt-in: auto-queue a newly-matched job for the local BoofSimplify worker instead of requiring
  // a manual "Queue for auto-apply" click. Reuses locations/categories/levels/degreeLevels/company
  // above as the same match-narrowing filter, plus its own (higher) score bar — see lib/auto-apply.ts.
  autoApply?: { enabled: boolean; minScore: number };
};
