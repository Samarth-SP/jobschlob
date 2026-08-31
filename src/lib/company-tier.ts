// Exclusivity clause: listings from these companies persist on the board for
// EXTENDED_RETENTION_DAYS instead of the default. Rationale — these employers leave reqs open
// for months, re-post the same role repeatedly, and carry enough applicant value that a slightly
// stale posting is still worth showing. Everyone else stays on the default short window.
//
// Scope (per the owner's call): large big-tech / AI players, and mid-to-large robotics/AV
// companies only. No finance, quant, consulting, defense/aerospace, semis, auto, or consumer.
//
// Matched case-insensitively and EXACTLY against jobs.company — SimplifyJobs' `company_name` for
// feed jobs, or the board slug for direct Greenhouse/Lever/Ashby jobs. A company reached through
// both a direct board and the Simplify feed therefore needs BOTH strings (e.g. "figureai" the
// slug and "Figure" the feed name).
//
// ponytail: exact-match list, not fuzzy. A feed rename silently drops a company back to the
// short window until someone adds the new string. Upgrade path if that churns: match on a
// distinctive lowercased token instead of the full name.

export const DEFAULT_RETENTION_DAYS = 7;
export const EXTENDED_RETENTION_DAYS = 30;

export const EXTENDED_RETENTION_COMPANIES: string[] = [
  // --- Large big tech ---
  "apple", "google", "alphabet", "microsoft", "amazon", "amazon web services", "aws", "meta",
  "netflix", "nvidia", "oracle", "salesforce", "adobe", "ibm", "uber", "airbnb", "snap",
  "snapchat", "pinterest", "linkedin", "stripe", "databricks", "palantir", "palantir technologies",
  "cisco", "dell", "dell technologies", "intuit", "servicenow", "workday", "coinbase", "block",
  "doordash", "instacart", "roblox", "epic games", "spotify", "reddit", "cloudflare",
  // --- AI labs ---
  "openai", "anthropic", "google deepmind", "deepmind", "xai", "scale ai", "mistral", "mistral ai",
  "cohere", "perplexity", "perplexity ai", "safe superintelligence", "thinking machines lab",
  // --- Robotics / AV (mid-to-large) ---
  // direct-board slugs (scripts/ingest.ts)
  "figureai", "physicalintelligence", "skildai-careers", "apptronik", "agilityrobotics",
  "pathrobotics", "diligentrobotics", "waabi", "shieldai", "brightmachines", "dexterity",
  "gecko-robotics", "reliable-robotics", "serverobotics", "standardbots",
  // Simplify feed names + other well-funded robotics/AV players
  "figure", "physical intelligence", "skild ai", "agility robotics", "path robotics",
  "diligent robotics", "shield ai", "bright machines", "gecko robotics", "reliable robotics",
  "serve robotics", "standard bots", "boston dynamics", "waymo", "zoox", "cruise", "nuro",
  "aurora", "aurora innovation", "kodiak robotics", "applied intuition", "neuralink", "skydio",
  "zipline", "1x", "1x technologies", "collaborative robotics", "bear robotics",
  "carbon robotics", "chef robotics",
];

// Exact (lowercased, trimmed) match — same comparison the SQL prune in queries.ts does, so the
// two never disagree.
const set = new Set(EXTENDED_RETENTION_COMPANIES.map((c) => c.toLowerCase().trim()));

export function isExtendedRetentionCompany(company: string | null | undefined): boolean {
  return company != null && set.has(company.toLowerCase().trim());
}
