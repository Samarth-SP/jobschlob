// scripts/ingest.ts joins a job's multiple office locations with "; " (see the comment there for
// why not ","). Used both to build the popular-locations bubble list and to match a job against
// the selected filter set.
export function splitLocations(location: string | null): string[] {
  if (!location) return [];
  return location
    .split("; ")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Coarse metro groupings so a user can filter "Bay Area" instead of individually picking every
// city a source happens to list separately (Palo Alto, Mountain View, San Jose, ...). Substring
// match against the raw location text (lowercased) rather than exact splitLocations() entries —
// sources format locations inconsistently ("San Francisco, CA" vs "SF Bay Area" vs "Remote (SF)"),
// and a substring test is robust to that without needing a full city/state parser.
export const LOCATION_AREAS: Record<string, string[]> = {
  "NYC": ["new york", "brooklyn", "manhattan", "queens", "bronx", "jersey city", "hoboken", "long island city"],
  "Bay Area": [
    "san francisco", "bay area", "san jose", "oakland", "palo alto", "mountain view", "sunnyvale",
    "santa clara", "fremont", "redwood city", "menlo park", "cupertino", "berkeley", "san mateo",
    "emeryville", "south san francisco",
  ],
  "Texas": ["austin", "dallas", "houston", "san antonio", "plano", "irving", "fort worth", "el paso"],
  "LA Area": ["los angeles", "santa monica", "culver city", "pasadena", "long beach", "burbank", "glendale", "hollywood"],
};

export function matchesArea(location: string | null, area: string): boolean {
  if (!location) return false;
  const needles = LOCATION_AREAS[area];
  if (!needles) return false;
  const lower = location.toLowerCase();
  return needles.some((n) => lower.includes(n));
}
