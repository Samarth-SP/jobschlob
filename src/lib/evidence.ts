// Shape of profiles.evidence_bank (jsonb) — a structured, per-bullet record of a candidate's
// experience, extracted from an uploaded resume (see lib/evidence-extract.ts) and sharpened by
// follow-up questions (see lib/evidence-interview.ts). Distinct from `background` (free prose,
// still supported as a supplementary catch-all): the workshop (lib/resume-scaffold.ts) prefers
// this when present, ranking and citing individual bullets (lib/evidence-rank.ts) instead of
// handing the model one undifferentiated blob.
//
// Same key names as the `experiences`/`projects`/`education`/`skills`/`raw_facts` payload
// `/api/apply/queue/route.ts` already sends BoofSimplify (empty today, by design — see that
// route's comment) — populating this bank is what fills that payload in for real, with no wire
// contract change on BoofSimplify's side.
import { createHash } from "node:crypto";

export type EvidenceBullet = {
  id: string;
  text: string;
  skills: string[];
  metrics: string[];
  source: string;
};

export type EvidenceEntry = {
  id: string;
  org: string; // employer, or blank for a project
  title: string; // role title, or the project's own name
  location?: string;
  start?: string;
  end?: string; // "present" for ongoing
  context?: string; // one line: what the org/project is, scope of the role
  bullets: EvidenceBullet[];
};

export type EduEntry = {
  id: string;
  school: string;
  degree?: string;
  field?: string;
  start?: string;
  end?: string;
  gpa?: string;
  honors?: string[];
};

export type EvidenceBank = {
  experiences: EvidenceEntry[];
  projects: EvidenceEntry[]; // same shape as an experience, org usually blank
  leadership: EvidenceEntry[]; // activities/leadership roles — used by the consulting archetype
  education: EduEntry[];
  skills: Record<string, string[]>; // bucketed, e.g. { languages: [...], tools: [...] }
  rawFacts: string[]; // anything meaningful that fits no other slot
};

export const EMPTY_EVIDENCE_BANK: EvidenceBank = {
  experiences: [],
  projects: [],
  leadership: [],
  education: [],
  skills: {},
  rawFacts: [],
};

export function isEmptyEvidenceBank(bank: EvidenceBank | null): boolean {
  if (!bank) return true;
  return (
    bank.experiences.length === 0 &&
    bank.projects.length === 0 &&
    bank.leadership.length === 0 &&
    bank.education.length === 0 &&
    Object.keys(bank.skills).length === 0 &&
    bank.rawFacts.length === 0
  );
}

function slug(...parts: string[]): string {
  const raw = parts.map((p) => (p || "").toLowerCase().trim()).join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 10);
}

// Stable, content-derived ids so a bullet's citation survives a later re-extraction of the
// SAME entry (interview answers target an entry by id — see evidence-interview.ts) — mirrors
// BoofSimplify's boof/profile/schema.py `assign_ids`.
export function assignEvidenceIds(bank: EvidenceBank): EvidenceBank {
  for (const section of [bank.experiences, bank.projects, bank.leadership]) {
    for (const item of section) {
      if (!item.id) item.id = `ent_${slug(item.org, item.title)}`;
      for (const b of item.bullets) {
        if (!b.id) b.id = `b_${slug(item.id, b.text)}`;
      }
    }
  }
  for (const e of bank.education) {
    if (!e.id) e.id = `edu_${slug(e.school, e.degree ?? "")}`;
  }
  return bank;
}

export type FlatBullet = EvidenceBullet & {
  parentId: string;
  section: "experiences" | "projects" | "leadership";
  org: string;
  title: string;
  start?: string;
  end?: string;
};

// Flat, citable list of every piece of evidence — mirrors boof/profile/schema.py `all_bullets`.
export function flattenBullets(bank: EvidenceBank): FlatBullet[] {
  const out: FlatBullet[] = [];
  (["experiences", "projects", "leadership"] as const).forEach((section) => {
    for (const item of bank[section]) {
      for (const b of item.bullets) {
        out.push({ ...b, parentId: item.id, section, org: item.org, title: item.title, start: item.start, end: item.end });
      }
    }
  });
  return out;
}

export function flatSkills(bank: EvidenceBank): string[] {
  return Object.values(bank.skills).flat();
}
