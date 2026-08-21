export type DashboardFilters = {
  minScore?: number;
  locations?: string[];
  areas?: string[]; // coarse metro groupings — see lib/locations.ts LOCATION_AREAS
  company?: string;
  categories?: string[];
  levels?: string[];
};
