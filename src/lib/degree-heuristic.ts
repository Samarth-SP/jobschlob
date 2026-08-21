// Degree-requirement classifier for sources that expose a job's full description (Greenhouse,
// Lever, Ashby — see scripts/ingest.ts). SimplifyJobs feeds don't carry description text at all,
// so every job sourced from them is left with a null degreeLevel; there's no per-job description
// fetch cheap enough to backfill that without a second request per listing.
//
// ponytail: a keyword regex, not real NLP — it returns the LOWEST degree mentioned (checking
// bachelor's first), since "Bachelor's or Master's, PhD preferred" is a job a bachelor's holder
// can still apply to, and that's the more useful signal for a "can I apply" filter. A posting
// that only says "advanced degree" or gives no degree signal at all classifies as null rather
// than guessing — same false-negative bias as lib/level-heuristic.ts, for the same reason.
const BACHELORS_RE = /\b(bachelor'?s?|b\.?s\.?|undergraduate degree|4-year degree)\b/i;
const MASTERS_RE = /\b(master'?s?|m\.?s\.?|graduate degree)\b/i;
const PHD_RE = /\b(ph\.?d\.?|doctorate|doctoral degree)\b/i;

export type DegreeLevel = "bachelors" | "masters" | "phd";

export function classifyDegree(text: string): DegreeLevel | null {
  if (BACHELORS_RE.test(text)) return "bachelors";
  if (MASTERS_RE.test(text)) return "masters";
  if (PHD_RE.test(text)) return "phd";
  return null;
}

// Greenhouse's `content` field (and nothing else here) is HTML — strip tags and decode the
// handful of entities actually seen in practice rather than pulling in a full HTML parser for a
// keyword search that doesn't care about structure.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
