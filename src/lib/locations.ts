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
