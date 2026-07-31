// Title-based entry-level classifier for sources that don't tag level themselves (Greenhouse
// boards list every seniority mixed together). SimplifyJobs feeds don't need this — their
// internship/new-grad split comes from which feed the listing was pulled from.
//
// ponytail: a title regex, not a real seniority model — it can misclassify ("Software Engineer
// I" isn't caught by anything here and gets excluded). Biased toward false negatives (missing an
// entry-level posting) over false positives (leaking a senior one in), which is the right
// direction for "entry level exclusively." Upgrade path if this proves too lossy: pull the
// Greenhouse job's `departments`/`offices` metadata or ask the LLM matcher to classify level too.
const SENIOR_RE = /\b(senior|sr\.|staff|principal|lead|manager|director|vp|vice president|head of|chief|executive|president)\b/i;
const INTERNSHIP_RE = /\b(intern(ship)?s?|co-?op)\b/i;
const NEW_GRAD_RE = /\b(new grad(uate)?s?|entry.?level|junior|jr\.|analyst|associate|campus|university (hire|recruit))\b/i;

export type JobLevel = "internship" | "new_grad";

export function classifyLevel(title: string): JobLevel | null {
  if (SENIOR_RE.test(title)) return null;
  if (INTERNSHIP_RE.test(title)) return "internship";
  if (NEW_GRAD_RE.test(title)) return "new_grad";
  return null;
}
