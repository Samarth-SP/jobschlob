// Shape of profiles.search_preferences (jsonb) — a user's own criteria for the LLM-powered job
// discovery in lib/job-search.ts. Distinct from lib/dashboard-filters.ts, which only narrows what
// the dashboard *displays* out of jobs already on the shared board; this is the spec a search
// actually goes out and looks for.
export type SearchPreferences = {
  enabled: boolean;
  // Free-form — not the old 4-value ingest.ts enum. e.g. ["consulting","techconsulting","swe","biotech"].
  tracks: string[];
  gradYear?: string;
  locationsPreferred: string[];
  locationsAcceptable: string[];
  remoteOk?: boolean;
  // Free text — e.g. "wet-lab background, life sciences consulting, avoid pure quant roles".
  criteria?: string;
};

export const EMPTY_SEARCH_PREFERENCES: SearchPreferences = {
  enabled: false,
  tracks: [],
  locationsPreferred: [],
  locationsAcceptable: [],
};
