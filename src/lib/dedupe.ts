import { createHash } from "node:crypto";

// Hash of source + the source's own stable per-listing id, so re-ingesting the same posting
// always maps to the same job id. Must NOT be derived from title/company alone — sources
// routinely have multiple open listings with an identical title (e.g. "Software Engineer" in
// three offices), which would collide onto one row and break the ingest upsert.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function jobId(source: string, externalId: string | number): string {
  const key = `${normalize(source)}|${normalize(String(externalId))}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
