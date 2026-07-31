// Keyword-overlap compatibility scoring — no LLM. This runs once per (job, user) pair on every
// ingest, so at the scale the Simplify feeds add (thousands of jobs) an LLM call per pair is both
// slow (hours, sequential) and a real ongoing cost for a score that's advisory at best. The LLM
// budget is reserved for the resume/cover-letter workshop (lib/resume-scaffold.ts), where a
// generated document actually benefits from real language understanding.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "by", "from",
  "is", "are", "was", "were", "be", "been", "being", "as", "it", "this", "that", "these", "those",
  "i", "my", "me", "we", "our", "you", "your", "he", "she", "they", "them", "their",
  "have", "has", "had", "do", "does", "did", "will", "would", "can", "could", "should",
  "not", "no", "so", "than", "then", "also", "into", "about", "over", "up", "out",
]);

// Keeps tech-ish tokens like "c++", "c#", "node.js" intact instead of splitting on every symbol.
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

export function scoreJobForUser(
  job: { title: string; company: string },
  background: string,
): { score: number; rationale: string } | null {
  const profileTokens = tokenize(background);
  if (profileTokens.size === 0) return null;

  const jobTokens = tokenize(`${job.title} ${job.company}`);
  if (jobTokens.size === 0) return null;

  const matched = [...jobTokens].filter((t) => profileTokens.has(t));
  const score = Math.round((matched.length / jobTokens.size) * 100);
  const rationale = matched.length
    ? `Matched keywords: ${matched.join(", ")}`
    : "No keyword overlap with background.";

  return { score, rationale };
}
