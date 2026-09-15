// Deterministic ATS keyword/quality scoring for a tailored resume against a specific job posting
// — ported from BoofSimplify's boof/tailor/ats.py. Deliberately not LLM-based: keyword coverage
// and format hygiene are mechanical checks, and a model that scores its own writing grades
// generously and inconsistently. Same resume in, same number out.
import type { ResumeData, ResumeProject } from "./resume-template";
import type { ParsedJd } from "./jd-parse";

const PUNCT = /[^a-z0-9+#./ -]+/g;
const SPACE = /\s+/g;

const WEAK_VERBS = [
  "helped", "assisted", "worked", "participated", "involved", "responsible",
  "supported", "contributed", "handled", "dealt", "various", "successfully",
  "utilized", "tasked",
];
const FILLER = [
  "team player", "hard worker", "detail-oriented", "go-getter", "synergy",
  "results-driven", "self-starter", "think outside the box", "dynamic individual",
];
const PRONOUNS = ["i", "me", "my", "mine", "we", "our", "myself"];

const SUFFIXES = ["ations", "ation", "ingly", "ings", "ing", "ers", "er", "ies", "ied", "es", "ed", "s"];

function suffixStem(word: string): string {
  for (const suf of SUFFIXES) {
    if (word.length > suf.length + 3 && word.endsWith(suf)) {
      const base = word.slice(0, -suf.length);
      return suf === "ies" ? base + "y" : base;
    }
  }
  return word;
}

export function normalize(text: string): string {
  return (text ?? "").toLowerCase().replace(PUNCT, " ").replace(SPACE, " ").trim();
}

function variants(term: string): Set<string> {
  const t = normalize(term);
  if (!t) return new Set();
  const out = new Set<string>([t, t.replace(/-/g, " "), t.replace(/-/g, ""), t.replace(/ /g, ""), t.replace(/\./g, ""), t.replace(/\//g, " ")]);
  const words = t.split(" ").filter(Boolean);
  if (words.length) out.add(words.map(suffixStem).join(" "));
  // "Amazon Web Services (AWS)" -> also match "AWS"
  const m = t.match(/\(([a-z0-9 +#./-]{2,12})\)/);
  if (m) {
    out.add(m[1].trim());
    out.add(t.replace(/\s*\([^)]*\)/, "").trim());
  }
  return new Set([...out].filter((v) => v.length >= 2));
}

export type Haystack = { norm: string; squashed: string; stems: Set<string> };

export function haystack(text: string): Haystack {
  const norm = normalize(text);
  const squashed = norm.replace(/ /g, "").replace(/-/g, "");
  const stems = new Set(norm.split(" ").filter(Boolean).map(suffixStem));
  return { norm, squashed, stems };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termPresent(term: string, hay: Haystack): boolean {
  for (const v of variants(term)) {
    if (v.includes(" ")) {
      if (hay.norm.includes(v)) return true;
      if (hay.squashed.includes(v.replace(/ /g, ""))) return true;
    } else {
      if (new RegExp(`(?<![a-z0-9])${escapeRe(v)}(?![a-z0-9])`).test(hay.norm)) return true;
      if (v.length >= 4 && hay.stems.has(suffixStem(v))) return true;
    }
  }
  return false;
}

export type KeywordReport = {
  hits: string[];
  misses: string[];
  keywordRate: number;
  mustHaveRate: number;
  mustHaveDetail: { requirement: string; coverage: number }[];
  titleAlignment: number;
};

const TITLE_STOPWORDS = new Set(["senior", "staff", "lead", "principal", "junior", "the", "and"]);

export function keywordReport(resumeText: string, jd: ParsedJd): KeywordReport {
  const hay = haystack(resumeText);
  const hard = jd.hardKeywords ?? [];
  const musts = jd.mustHave ?? [];

  const hits: string[] = [];
  const misses: string[] = [];
  for (const kw of hard) (termPresent(kw, hay) ? hits : misses).push(kw);

  const mustCov = musts
    .map((req) => {
      const words = normalize(req).split(" ").filter((w) => w.length > 3).slice(0, 10);
      if (!words.length) return null;
      const got = words.filter((w) => termPresent(w, hay)).length;
      return { requirement: req, coverage: Math.round((got / words.length) * 100) / 100 };
    })
    .filter((x): x is { requirement: string; coverage: number } => x !== null);
  const coveredMusts = mustCov.filter((m) => m.coverage >= 0.5);

  const kwRate = hard.length ? hits.length / hard.length : 1.0;
  const mustRate = mustCov.length ? coveredMusts.length / mustCov.length : 1.0;

  const titleWords = normalize(jd.title).split(" ").filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
  const titleHit = titleWords.length ? titleWords.filter((w) => termPresent(w, hay)).length / titleWords.length : 1.0;

  return {
    hits,
    misses,
    keywordRate: Math.round(kwRate * 1000) / 1000,
    mustHaveRate: Math.round(mustRate * 1000) / 1000,
    mustHaveDetail: mustCov,
    titleAlignment: Math.round(titleHit * 1000) / 1000,
  };
}

function bulletsOf(resume: ResumeData): string[] {
  const out: string[] = [];
  for (const e of resume.experience ?? []) out.push(...(e.bullets ?? []));
  for (const p of resume.projects ?? []) out.push(...(p.bullets ?? []));
  return out;
}

export type QualityReport = {
  bulletCount: number;
  metricRate: number;
  wordCount: number;
  weakVerbs: string[];
  issues: string[];
};

export function qualityReport(resume: ResumeData, resumeText: string): QualityReport {
  const bullets = bulletsOf(resume);
  const n = bullets.length;
  const issues: string[] = [];

  const withNumber = bullets.filter((b) => /\d/.test(b)).length;
  const metricRate = n ? withNumber / n : 0;
  if (metricRate < 0.45) issues.push(`Only ${withNumber}/${n} bullets contain a number — aim for at least half.`);

  const longBullets = bullets.filter((b) => b.length > 240);
  if (longBullets.length) issues.push(`${longBullets.length} bullet(s) run past two lines.`);
  const stubBullets = bullets.filter((b) => b.length < 45);
  if (stubBullets.length) issues.push(`${stubBullets.length} bullet(s) are too short to carry evidence.`);

  const lowered = bullets.map((b) => b.toLowerCase());
  const weak = WEAK_VERBS.filter((w) => lowered.some((b) => new RegExp(`\\b${w}\\b`).test(b))).sort();
  if (weak.length) issues.push(`Weak/passive language: ${weak.slice(0, 6).join(", ")}.`);

  const lowerText = resumeText.toLowerCase();
  const filler = FILLER.filter((f) => lowerText.includes(f)).sort();
  if (filler.length) issues.push(`Cliché phrasing: ${filler.slice(0, 4).join(", ")}.`);

  const pron = PRONOUNS.filter((p) => lowered.some((b) => new RegExp(`\\b${p}\\b`).test(b))).sort();
  if (pron.length) issues.push(`First-person pronouns in bullets: ${pron.join(", ")}.`);

  const wordCount = normalize(resumeText).split(" ").filter(Boolean).length;
  if (wordCount < 350) issues.push(`Thin at ${wordCount} words for a one-page target.`);
  else if (wordCount > 800) issues.push(`Long at ${wordCount} words for a one-page target.`);

  return { bulletCount: n, metricRate: Math.round(metricRate * 1000) / 1000, wordCount, weakVerbs: weak, issues };
}

export type AtsScoreResult = {
  total: number;
  grade: "strong" | "solid" | "needs work" | "weak";
  parts: Record<string, number>;
  missingKeywords: string[];
  matchedKeywords: string[];
  uncoveredRequirements: string[];
  issues: string[];
  metricRate: number;
  wordCount: number;
  bulletCount: number;
};

export function scoreResume(resume: ResumeData, resumeText: string, jd: ParsedJd): AtsScoreResult {
  const kw = keywordReport(resumeText, jd);
  const q = qualityReport(resume, resumeText);

  const parts: Record<string, number> = {
    keywordCoverage: 35 * kw.keywordRate,
    mustHaveCoverage: 25 * kw.mustHaveRate,
    titleAlignment: 10 * kw.titleAlignment,
    quantification: 15 * Math.min(q.metricRate / 0.6, 1.0),
    formatHygiene: 15 * Math.max(0, 1 - 0.12 * q.issues.length),
  };
  const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10;

  return {
    total,
    grade: total >= 82 ? "strong" : total >= 70 ? "solid" : total >= 55 ? "needs work" : "weak",
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    missingKeywords: kw.misses,
    matchedKeywords: kw.hits,
    uncoveredRequirements: kw.mustHaveDetail.filter((m) => m.coverage < 0.5).map((m) => m.requirement),
    issues: q.issues,
    metricRate: q.metricRate,
    wordCount: q.wordCount,
    bulletCount: q.bulletCount,
  };
}

// Plain-text rendering of the structured content — what this module's scoring operates on
// (distinct from resume-template.ts's LaTeX rendering, which is for the PDF).
export function resumeToPlainText(d: ResumeData): string {
  const lines: string[] = [d.name, (d.contact ?? []).join(" | ")];
  for (const [label, entries] of [
    ["EDUCATION", d.education ?? []],
    ["EXPERIENCE", d.experience ?? []],
  ] as const) {
    if (!entries.length) continue;
    lines.push("", label);
    for (const e of entries) {
      lines.push(`${e.role} — ${e.organization}  ${e.dates}  ${e.location}`.trim());
      lines.push(...(e.bullets ?? []).map((b) => `• ${b}`));
    }
  }
  if (d.projects?.length) {
    lines.push("", "PROJECTS");
    for (const p of d.projects as ResumeProject[]) {
      lines.push(`${p.name}  ${p.dates}`);
      lines.push(...(p.bullets ?? []).map((b) => `• ${b}`));
    }
  }
  if (d.skills?.length) {
    lines.push("", "SKILLS");
    for (const g of d.skills) lines.push(`${g.category}: ${(g.items ?? []).join(", ")}`);
  }
  return lines.join("\n");
}
