// Resume text -> structured evidence bank, ported from BoofSimplify's boof/profile/ingest.py.
// v1 is full-replace, not an accretive merge: a single evidenceBank blob per user, populated by
// re-uploading a resume, doesn't have BoofSimplify's multi-document merge problem (that tool
// folds a growing pile of resumes/write-ups/reviews together over time) — the caller is expected
// to show the extracted bank back to the user for a confirm-before-save step rather than silently
// overwriting.
import { callTool, type LlmTool } from "./llm-client";
import {
  type EvidenceBank,
  type EvidenceEntry,
  type EduEntry,
  assignEvidenceIds,
} from "./evidence";

const ENTRY_ITEM = {
  type: "object" as const,
  properties: {
    org: { type: "string", description: "Employer name. Empty string for a project with no organization." },
    title: { type: "string", description: "Role title, or the project's own name." },
    location: { type: "string" },
    start: { type: "string", description: "YYYY-MM if known, else as written." },
    end: { type: "string", description: '"present" if ongoing, else YYYY-MM or as written.' },
    context: { type: "string", description: "One line: what the org/project is, scope of the role." },
    bullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The accomplishment, verbatim or lightly cleaned." },
          skills: { type: "array", items: { type: "string" }, description: "Concrete skills/tools this bullet demonstrates." },
          metrics: { type: "array", items: { type: "string" }, description: "Any number appearing in this bullet, exactly as written ($2.4M, 37%, 4x, 12 people)." },
        },
        required: ["text"],
      },
    },
  },
  required: ["org", "title", "bullets"],
};

const EDU_ITEM = {
  type: "object" as const,
  properties: {
    school: { type: "string" },
    degree: { type: "string" },
    field: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    gpa: { type: "string" },
    honors: { type: "array", items: { type: "string" } },
  },
  required: ["school"],
};

const EVIDENCE_TOOL: LlmTool = {
  name: "emit_evidence_bank",
  description: "Extract everything this resume states about the candidate into a structured evidence bank.",
  input_schema: {
    type: "object",
    properties: {
      experiences: { type: "array", items: ENTRY_ITEM, description: "Jobs and internships." },
      projects: { type: "array", items: ENTRY_ITEM, description: "Personal/academic/side projects. org is usually empty." },
      leadership: { type: "array", items: ENTRY_ITEM, description: "Clubs, activities, volunteering, leadership roles — not paid employment." },
      education: { type: "array", items: EDU_ITEM },
      skills: {
        type: "object",
        description: 'Bucketed skill lists, e.g. {"languages": ["Python","C++"], "tools": ["Git"], "domains": ["fintech"]}. Be exhaustive — sweep bullets too, not just a skills section.',
        additionalProperties: { type: "array", items: { type: "string" } },
      },
      rawFacts: { type: "array", items: { type: "string" }, description: "Anything meaningful stated in the resume that fits no field above, one fact per string." },
    },
    required: ["experiences", "projects", "leadership", "education", "skills", "rawFacts"],
  },
};

const SYSTEM =
  "You are an information-extraction engine for a resume-building system. You read a resume and " +
  "output structured JSON about the ONE person it describes. Extract only what the document " +
  "supports — never invent an employer, date, metric, title, school or technology. Preserve every " +
  "number exactly as written ($2.4M, 37%, 12 people, 4x); metrics are the most valuable thing in the " +
  "document, never round or drop one. Keep each accomplishment as its own bullet, in the document's " +
  "own words where possible — do not merge two accomplishments into one bullet. Respond only via " +
  "the tool call.";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function normalizeEntries(v: unknown, source: string): EvidenceEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const r = raw as Record<string, unknown>;
    const bullets = Array.isArray(r.bullets) ? r.bullets : [];
    return {
      id: "",
      org: String(r.org ?? ""),
      title: String(r.title ?? ""),
      location: r.location ? String(r.location) : undefined,
      start: r.start ? String(r.start) : undefined,
      end: r.end ? String(r.end) : undefined,
      context: r.context ? String(r.context) : undefined,
      bullets: bullets.map((b) => {
        const bb = b as Record<string, unknown>;
        return {
          id: "",
          text: String(bb.text ?? "").trim(),
          skills: asStringArray(bb.skills),
          metrics: asStringArray(bb.metrics),
          source,
        };
      }).filter((b) => b.text),
    };
  });
}

function normalizeEducation(v: unknown): EduEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: "",
      school: String(r.school ?? ""),
      degree: r.degree ? String(r.degree) : undefined,
      field: r.field ? String(r.field) : undefined,
      start: r.start ? String(r.start) : undefined,
      end: r.end ? String(r.end) : undefined,
      gpa: r.gpa ? String(r.gpa) : undefined,
      honors: asStringArray(r.honors),
    };
  }).filter((e) => e.school);
}

function normalizeSkills(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [bucket, items] of Object.entries(v as Record<string, unknown>)) {
    const list = asStringArray(items);
    if (list.length) out[bucket] = list;
  }
  return out;
}

export async function extractEvidenceFromText(userId: string, text: string, sourceLabel: string): Promise<EvidenceBank> {
  const data = await callTool<Record<string, unknown>>(
    userId,
    "evidenceExtract",
    SYSTEM,
    `Resume (source: ${sourceLabel}):\n\n${text.slice(0, 20000)}`,
    EVIDENCE_TOOL,
    6000,
  );

  const bank: EvidenceBank = {
    experiences: normalizeEntries(data.experiences, sourceLabel),
    projects: normalizeEntries(data.projects, sourceLabel),
    leadership: normalizeEntries(data.leadership, sourceLabel),
    education: normalizeEducation(data.education),
    skills: normalizeSkills(data.skills),
    rawFacts: asStringArray(data.rawFacts),
  };
  return assignEvidenceIds(bank);
}
