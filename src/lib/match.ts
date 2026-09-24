// Keyword-overlap compatibility scoring — no LLM. This runs once per (job, user) pair on every
// ingest, so at the scale the Simplify feeds add (thousands of jobs) an LLM call per pair is both
// slow (hours, sequential) and a real ongoing cost for a score that's advisory at best. The LLM
// budget is reserved for the resume/cover-letter workshop (lib/resume-scaffold.ts), where a
// generated document actually benefits from real language understanding.
import { isEmptyEvidenceBank, type EvidenceBank } from "./evidence";

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

// Flattens every bit of text an evidence bank holds (bullets, skills, org/title/context, raw
// facts) into one corpus — a much richer keyword pool than the free-text `background` blob, which
// is why scoreJobForUser prefers it below. Same "prefer the bank when non-empty" convention
// lib/resume-scaffold.ts already uses for the workshop.
function evidenceBankText(bank: EvidenceBank): string {
  const parts: string[] = [];
  for (const entry of [...bank.experiences, ...bank.projects, ...bank.leadership]) {
    parts.push(entry.title, entry.org, entry.context ?? "");
    for (const b of entry.bullets) parts.push(b.text, ...b.skills);
  }
  for (const edu of bank.education) parts.push(edu.school, edu.degree ?? "", edu.field ?? "");
  for (const skills of Object.values(bank.skills)) parts.push(...skills);
  parts.push(...bank.rawFacts);
  return parts.join(" ");
}

export function scoreJobForUser(
  job: { title: string; company: string },
  background: string,
  evidenceBank?: EvidenceBank | null,
): { score: number; rationale: string } | null {
  const corpus = evidenceBank && !isEmptyEvidenceBank(evidenceBank) ? evidenceBankText(evidenceBank) : background;
  const profileTokens = tokenize(corpus);
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
