// Scores every evidence bullet so the workshop sees the best material first, instead of handing
// the model one undifferentiated blob — ported from BoofSimplify's boof/tailor/engine.py
// (`rank_evidence` / `evidence_digest`). Reuses ats-score.ts's own keyword-matching primitives
// (`haystack`/`termPresent`) rather than re-implementing term matching a second way.
//
// Two modes: a JD is present (job-tied generation) — score by literal overlap with its
// keywords/must-haves/responsibilities, same signal the ATS score itself checks against. A JD is
// absent ("generalized", job-less resume) — there is nothing to score against, so this falls back
// to recency + whether a bullet carries a concrete number, plus a soft nudge from the user's own
// stated search preferences (tracks/criteria) — the one existing, currently-unused-by-generation
// signal about what kind of role they're even going for.
import type { ParsedJd } from "./jd-parse";
import type { SearchPreferences } from "./search-preferences";
import { haystack, termPresent } from "./ats-score";
import { type EvidenceBank, type FlatBullet, flattenBullets } from "./evidence";

export type RankedBullet = FlatBullet & { relevance: number };

function jdTerms(jd: ParsedJd): { term: string; weight: number }[] {
  const terms: { term: string; weight: number }[] = [];
  for (const k of jd.hardKeywords) terms.push({ term: k, weight: 1.0 });
  for (const r of jd.mustHave) for (const w of r.split(/\s+/)) if (w.length > 4) terms.push({ term: w, weight: 0.35 });
  for (const r of jd.responsibilities) for (const w of r.split(/\s+/)) if (w.length > 4) terms.push({ term: w, weight: 0.2 });
  return terms;
}

function hasDigit(text: string): boolean {
  return /\d/.test(text);
}

// Present/ongoing scores highest; a bare year further in the past scores lower. A date we can't
// parse at all (some free-text date the extractor didn't normalize) gets a modest default rather
// than zero — an unparsed date is not evidence the role is old.
function recencyScore(end?: string): number {
  const e = (end ?? "").toLowerCase().trim();
  if (!e || e === "present" || e === "current" || e === "now") return 1;
  const year = parseInt(e.slice(0, 4), 10);
  if (Number.isNaN(year)) return 0.3;
  const yearsAgo = new Date().getFullYear() - year;
  return Math.max(0, 1 - yearsAgo * 0.12);
}

export function rankEvidenceBullets(bank: EvidenceBank, jd?: ParsedJd, prefs?: SearchPreferences | null): RankedBullet[] {
  const flat = flattenBullets(bank);
  const terms = jd ? jdTerms(jd) : [];
  const softHints = !jd
    ? [...(prefs?.tracks ?? []), ...(prefs?.criteria ?? "").split(/[,.]+/)].map((s) => s.trim()).filter((s) => s.length > 3)
    : [];

  const ranked = flat.map((b) => {
    const hay = haystack([b.text, ...b.skills, b.title, b.org].join(" "));
    let score = 0;
    for (const { term, weight } of terms) if (termPresent(term, hay)) score += weight;
    if (!jd) {
      for (const hint of softHints) if (termPresent(hint, hay)) score += 0.15;
      score += recencyScore(b.end) * 0.6;
    }
    if (hasDigit(b.text)) score += 0.4;
    return { ...b, relevance: Math.round(score * 100) / 100 };
  });
  ranked.sort((a, c) => c.relevance - a.relevance);
  return ranked;
}

const SECTION_LABEL = { experiences: "EXPERIENCE", projects: "PROJECT", leadership: "LEADERSHIP" } as const;

// Compact, id-addressable rendering of the evidence bank for prompts — ported from boof's
// `evidence_digest`. Only the top `limit` bullets by relevance are included, but a whole entry is
// dropped entirely rather than shown with zero bullets.
export function serializeEvidenceBank(bank: EvidenceBank, ranked: RankedBullet[], limit = 90): string {
  const keep = new Set(ranked.slice(0, limit).map((b) => b.id));
  const relevanceOf = new Map(ranked.map((b) => [b.id, b.relevance]));
  const lines: string[] = [];

  (["experiences", "projects", "leadership"] as const).forEach((section) => {
    for (const item of bank[section]) {
      const bullets = item.bullets.filter((b) => keep.has(b.id));
      if (!bullets.length) continue;
      const head = item.org ? `${item.title} at ${item.org}` : item.title;
      lines.push(`\n[${SECTION_LABEL[section]} id=${item.id}] ${head} | ${item.start ?? "?"} to ${item.end ?? "?"}`);
      if (item.context) lines.push(`  context: ${item.context}`);
      for (const b of bullets) lines.push(`  - (${b.id} | relevance ${relevanceOf.get(b.id) ?? 0}) ${b.text}`);
    }
  });

  if (bank.education.length) {
    lines.push("\n[EDUCATION]");
    for (const e of bank.education) {
      const line = `${e.degree ?? ""} ${e.field ?? ""}`.trim();
      lines.push(`  - ${line ? `${line} — ` : ""}${e.school} (${e.start ?? "?"}-${e.end ?? "?"})${e.gpa ? `, GPA ${e.gpa}` : ""}`);
    }
  }

  const skillsFlat = Object.entries(bank.skills).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" | ");
  if (skillsFlat) lines.push(`\n[SKILLS] ${skillsFlat}`);
  if (bank.rawFacts.length) lines.push(`\n[OTHER FACTS]\n${bank.rawFacts.map((f) => `  - ${f}`).join("\n")}`);

  return lines.join("\n");
}
