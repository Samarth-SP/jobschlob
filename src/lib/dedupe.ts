import { createHash } from "node:crypto";

// Normalize + hash so the same posting from the same source always maps to the same job id,
// even if title/location whitespace or casing differs between scrapes.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function jobId(source: string, title: string, company: string): string {
  const key = `${normalize(source)}|${normalize(title)}|${normalize(company)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
