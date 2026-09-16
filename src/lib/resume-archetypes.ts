// Per-role-family resume conventions — a tech resume and a consulting resume differ in section
// order, what's suppressed, and bullet grammar, not just wording. Ported from BoofSimplify's
// boof/tailor/archetypes.py + archetypes/*.yaml, condensed to a TS const map (this app's other
// small per-thing config, like lib/company-tier.ts, is also a plain const, not a data file).
//
// Deliberately NOT a 1:1 mapping onto jobs.category ('tech'|'consulting'|'vc_pe'|'robotics') —
// that's a per-source-board label (which scraper a posting came from), not a resume-writing
// convention: a robotics posting reads as a technical resume (same conventions as tech), and a
// vc_pe posting reads closer to consulting (deal experience, leadership-heavy) than as a fourth
// distinct style. `categoryToArchetype` below is a UI default/suggestion only — never a hard
// coupling, and the user can always override it.
import type { SectionKey } from "./resume-template";

export type ArchetypeKey = "tech" | "consulting" | "generalist";

export type ResumeArchetype = {
  key: ArchetypeKey;
  label: string;
  sectionOrder: SectionKey[];
  trimPriority: SectionKey[];
  bulletStyle: string; // injected into the writer's system prompt
  verbs: string[];
  emphasize: string[];
  suppress: string[];
  includeGpaHonors: boolean;
  keywordStrictness: "high" | "medium" | "low";
};

export const ARCHETYPES: Record<ArchetypeKey, ResumeArchetype> = {
  tech: {
    key: "tech",
    label: "Software / Technical",
    sectionOrder: ["experience", "projects", "education", "skills"],
    trimPriority: ["projects", "experience"],
    bulletStyle:
      "Name the system, the technical approach, and the measurable effect. Scale and reliability numbers " +
      "beat adjectives (QPS, p99 latency, data volume, users, cost, build time, incident count). State the " +
      "technology explicitly — both an ATS and an engineer reading this scan for it. Formula: " +
      "[verb] [system/component] using [tech], [quantified impact].",
    verbs: ["Built", "Designed", "Shipped", "Migrated", "Optimized", "Scaled", "Instrumented", "Refactored", "Automated", "Architected", "Reduced", "Owned"],
    emphasize: [
      "systems designed and owned end to end",
      "scale and performance numbers",
      "specific languages and infrastructure",
      "production ownership",
      "shipped user-facing outcomes",
    ],
    suppress: ["generic teamwork claims", "unquantified \"improved performance\"", "soft skills without evidence"],
    includeGpaHonors: false,
    keywordStrictness: "high",
  },
  consulting: {
    key: "consulting",
    label: "Consulting / Strategy",
    sectionOrder: ["education", "experience", "leadership", "skills"],
    trimPriority: ["leadership", "experience"],
    bulletStyle:
      "Lead with the action and the business outcome, not the process. Every bullet must carry scope (team " +
      "size, budget, client revenue, geography) or a quantified result. Formula: [strong verb] [what] " +
      "[for whom / at what scale], [quantified so-what]. Avoid tool names unless the tool is the point — " +
      "write for a non-technical reader skimming for 20 seconds.",
    verbs: ["Led", "Drove", "Advised", "Structured", "Diagnosed", "Negotiated", "Launched", "Recommended", "Quantified", "Influenced", "Delivered"],
    emphasize: [
      "quantified business impact",
      "client / stakeholder exposure",
      "leadership and team scope",
      "cross-functional influence",
      "revenue or cost figures",
    ],
    suppress: ["implementation minutiae", "tool and library names", "code-level detail"],
    includeGpaHonors: true,
    keywordStrictness: "medium",
  },
  generalist: {
    key: "generalist",
    label: "General purpose",
    sectionOrder: ["experience", "education", "projects", "skills"],
    trimPriority: ["projects", "experience"],
    bulletStyle:
      "Lead with the action and the concrete result. Every bullet should carry a number where the evidence " +
      "has one (scale, time, money, count). Formula: [verb] [what] [context], [quantified result].",
    verbs: ["Led", "Built", "Managed", "Delivered", "Improved", "Launched", "Created", "Organized", "Coordinated"],
    emphasize: ["concrete, quantified outcomes", "ownership and initiative", "breadth relevant to the target roles"],
    suppress: ["vague claims with no scope or number"],
    includeGpaHonors: true,
    keywordStrictness: "medium",
  },
};

export const ARCHETYPE_LIST: ResumeArchetype[] = Object.values(ARCHETYPES);

export function getArchetype(key?: string | null): ResumeArchetype {
  return (key && ARCHETYPES[key as ArchetypeKey]) || ARCHETYPES.generalist;
}

// jobs.category, mirrored loosely rather than imported from db/schema.ts (that column is a plain
// untyped text field — see the comment above for why it isn't archetyped 1:1 anyway).
export type JobCategory = "tech" | "consulting" | "vc_pe" | "robotics";

export const CATEGORY_TO_ARCHETYPE: Partial<Record<JobCategory, ArchetypeKey>> = {
  tech: "tech",
  robotics: "tech",
  consulting: "consulting",
  vc_pe: "consulting",
};

export function suggestArchetype(category?: string | null): ArchetypeKey {
  return (category && CATEGORY_TO_ARCHETYPE[category as JobCategory]) || "generalist";
}

// Compact instruction block injected into the resume-writing prompt — mirrors boof's
// `style_brief`. Section-order/labels are described here too so the model's content selection
// (which bullets, how many, what to emphasize) matches what the template will actually render,
// not the app's old fixed order.
export function styleBrief(archetype: ResumeArchetype): string {
  return `ROLE FAMILY: ${archetype.label}
Section order this resume will render in: ${archetype.sectionOrder.join(" > ")}
${archetype.sectionOrder.includes("leadership") ? "Include a Leadership & Activities section (clubs, volunteering, leadership roles — not paid employment) when the evidence supports one." : "Do not populate leadership — this archetype's template has no such section."}

BULLET STYLE (follow exactly):
${archetype.bulletStyle}

Preferred verbs: ${archetype.verbs.join(", ")}

EMPHASIZE: ${archetype.emphasize.join("; ")}
SUPPRESS: ${archetype.suppress.join("; ")}

Include GPA/honors if the evidence has them: ${archetype.includeGpaHonors}
Keyword mirroring against the job posting: ${archetype.keywordStrictness}`;
}
