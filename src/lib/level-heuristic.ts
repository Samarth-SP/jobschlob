// Title-based entry-level classifier for sources that don't tag level themselves (Greenhouse
// boards list every seniority mixed together). SimplifyJobs feeds don't need this — their
// internship/new-grad split comes from which feed the listing was pulled from.
//
// Two modes:
//   strict (default) — a title must carry a positive entry-level marker (intern, junior, new
//     grad, analyst, "Engineer I", …) to pass. Biased hard toward false negatives: misses some
//     entry-level roles rather than leak a senior one. Right for the tech/consulting/vc_pe
//     boards, where "Software Engineer" with no qualifier is usually not a new-grad req.
//   lenient — anything that isn't visibly senior passes as new_grad. Used for the robotics
//     boards (scripts/ingest.ts passes lenient for category === "robotics"), where startups
//     title almost everything as a bare "<X> Engineer" regardless of seniority and strict mode
//     drops ~95% of the board. A few mid-level roles leak in; that's the accepted tradeoff for
//     actually surfacing the robotics pipeline.
//
// ponytail: still just title regexes, no real seniority model. Upgrade path if leniency proves
// too noisy: pull the Greenhouse/Lever/Ashby posting's department metadata, or an LLM pass.
const SENIOR_RE =
  /\b(senior|sr\.?|staff|principal|lead|manager|director|vp|vice president|head of|chief|executive|president|expert|distinguished|architect|iii|iv|l[4-9])\b/i;
const INTERNSHIP_RE = /\b(intern(ship)?s?|co-?op|apprentice(ship)?)\b/i;
const NEW_GRAD_RE =
  /\b(new grad(uate)?s?|grad(uate)? (program|scheme|engineer|analyst|associate|hire)|entry.?level|early career|early talent|junior|jr\.?|analyst|associate|campus|university (hire|recruit)|rotational)\b/i;
// "Engineer I", "Engineer 1", "Analyst, Level I" — an explicit lowest rung. Only I / 1 / one;
// II+ is caught as senior-ish above and left out.
const LEVEL_ONE_RE = /\b(engineer|scientist|developer|designer|analyst|associate|technician|specialist)\s*[-,]?\s*(level\s*)?(i|1|one)\b/i;

export type JobLevel = "internship" | "new_grad";

export function classifyLevel(title: string, lenient = false): JobLevel | null {
  if (SENIOR_RE.test(title)) return null;
  if (INTERNSHIP_RE.test(title)) return "internship";
  if (NEW_GRAD_RE.test(title)) return "new_grad";
  if (LEVEL_ONE_RE.test(title)) return "new_grad";
  if (lenient) return "new_grad";
  return null;
}
