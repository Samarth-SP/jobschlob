// Mechanical grounding check on generated resume/cover-letter content — adapted from
// BoofSimplify's boof/tailor/engine.py verify()/verify_summary(). BoofSimplify checks per-bullet
// citations against an evidence bank with stable bullet ids; jobschlob has no such bank, only a
// free-text profiles.background blob, so this port checks every number/credential the model wrote
// against that whole blob instead of a per-bullet citation. Less precise (no citation to point
// at), but catches the same dangerous class of error: an invented figure, an upgraded credential,
// or a job-posting term parroted back as the candidate's own experience.
import type { ResumeData, CoverLetterData } from "./resume-template";
import type { ParsedJd } from "./jd-parse";
import { normalize, termPresent, type Haystack } from "./ats-score";

const NUM_RE = /(?<![A-Za-z0-9])\d[\d,.]*\s*(?:%|percent|k|m|bn|b|x|hrs?|hours?|days?|weeks?|months?|years?|yrs?)?/gi;

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUM_RE)) {
    const tok = m[0].toLowerCase().replace(/,/g, "").replace(/ /g, "").replace(/\.$/, "");
    if (tok && !/^(19|20)\d\d$/.test(tok)) out.add(tok);
  }
  return out;
}

// Credentials a resume/letter must never claim without evidence — these are the claims that turn
// an optimistic document into a disqualifying one.
const CREDENTIALS: Record<string, string[]> = {
  phd: ["ph.d", "phd", "doctorate", "doctoral"],
  md: ["m.d.", "md,", " md ", "medical doctor"],
  mba: ["m.b.a", "mba"],
  jd: ["j.d.", "juris doctor"],
  dvm: ["dvm", "d.v.m"],
  pharmd: ["pharmd", "pharm.d"],
  rn: ["registered nurse", " rn ", "r.n."],
  cpa: ["cpa", "c.p.a"],
  cfa: ["cfa", "chartered financial analyst"],
  pe: ["professional engineer"],
  pmp: ["pmp", "project management professional"],
  series7: ["series 7"],
  postdoc: ["postdoc", "post-doctoral", "postdoctoral"],
};

export type GroundingProblem = { severity: "high" | "info"; excerpt: string; issue: string };
export type GroundingResult = { checked: number; problems: GroundingProblem[]; grounded: boolean };

function textHaystack(text: string): Haystack {
  const norm = normalize(text);
  return { norm, squashed: norm.replace(/ /g, ""), stems: new Set(norm.split(" ").filter(Boolean)) };
}

function checkPassage(text: string, background: string, backgroundNums: Set<string>, jd: ParsedJd | null, checkJdEcho: boolean): GroundingProblem[] {
  if (!text.trim()) return [];
  const low = text.toLowerCase();
  const have = background.toLowerCase();
  const problems: GroundingProblem[] = [];

  for (const [name, forms] of Object.entries(CREDENTIALS)) {
    if (forms.some((f) => low.includes(f)) && !forms.some((f) => have.includes(f))) {
      problems.push({ severity: "high", excerpt: text, issue: `claims a credential your background does not show (${name.toUpperCase()})` });
    }
  }

  for (const n of numbersIn(text)) {
    if (/^\d{1,2}(years?|yrs?)?$/.test(n)) continue;
    if (!backgroundNums.has(n)) problems.push({ severity: "high", excerpt: text, issue: `the figure '${n}' does not appear anywhere in your background` });
  }

  if (checkJdEcho && jd) {
    const hay = textHaystack(text);
    const bgHay = textHaystack(background);
    for (const kw of jd.hardKeywords ?? []) {
      if (termPresent(kw, hay) && !termPresent(kw, bgHay)) {
        problems.push({ severity: "high", excerpt: text, issue: `claims '${kw}' — that comes from the job posting, not from your background` });
      }
    }
  }
  return problems;
}

export function groundingCheckResume(resume: ResumeData, background: string, jd: ParsedJd | null): GroundingResult {
  const backgroundNums = numbersIn(background);
  const problems: GroundingProblem[] = [];
  let checked = 0;

  for (const e of resume.experience ?? []) {
    for (const b of e.bullets ?? []) {
      checked++;
      problems.push(...checkPassage(b, background, backgroundNums, jd, false));
    }
  }
  for (const p of resume.projects ?? []) {
    for (const b of p.bullets ?? []) {
      checked++;
      problems.push(...checkPassage(b, background, backgroundNums, jd, false));
    }
  }
  return { checked, problems, grounded: !problems.some((p) => p.severity === "high") };
}

export function groundingCheckCoverLetter(letter: CoverLetterData, background: string, jd: ParsedJd | null): GroundingResult {
  const backgroundNums = numbersIn(background);
  const problems: GroundingProblem[] = [];
  let checked = 0;
  for (const p of letter.paragraphs ?? []) {
    checked++;
    problems.push(...checkPassage(p, background, backgroundNums, jd, true));
  }
  return { checked, problems, grounded: !problems.some((p) => p.severity === "high") };
}
