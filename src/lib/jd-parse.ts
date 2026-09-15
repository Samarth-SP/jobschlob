// Job description -> structured requirements, ported from BoofSimplify's boof/jd/parse.py.
// hardKeywords is the load-bearing field: those are the literal tokens an ATS keyword filter and
// a recruiter's boolean search look for, so they're extracted verbatim rather than paraphrased.
// Only called when the user actually pastes a job description into the workshop (see
// resume-scaffold.ts) — this is a per-generation, user-triggered call, not a per-ingest one, so
// it doesn't reintroduce the sequential-LLM-call cost problem lib/match.ts's job board scoring
// deliberately moved away from.
import { callTool, type LlmTool } from "./llm-client";

export type ParsedJd = {
  title: string;
  company: string;
  mustHave: string[];
  niceToHave: string[];
  responsibilities: string[];
  hardKeywords: string[];
};

const JD_TOOL: LlmTool = {
  name: "emit_jd_requirements",
  description:
    "Extract structured requirements from a job posting, for literal ATS-style keyword matching against a resume. Never invent a requirement that isn't stated.",
  input_schema: {
    type: "object",
    properties: {
      mustHave: { type: "array", items: { type: "string" }, description: "Each hard requirement as its own string, as stated." },
      niceToHave: { type: "array", items: { type: "string" }, description: "Each preferred qualification, as stated." },
      responsibilities: { type: "array", items: { type: "string" }, description: "Main duties, condensed to one line each." },
      hardKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "VERBATIM technical terms, tools, methods, certifications, domain nouns and named systems from the posting, copied with the posting's exact spelling and casing — matched literally against a resume. Include both an acronym and its expansion when the posting uses both. 15-35 items.",
      },
    },
    required: ["mustHave", "niceToHave", "responsibilities", "hardKeywords"],
  },
};

const SYSTEM =
  "You are a recruiting analyst. You read job descriptions and extract their requirements precisely. " +
  "You never invent requirements that are not stated. Respond only via the tool call.";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export async function parseJobDescription(userId: string, description: string, title: string, company: string): Promise<ParsedJd> {
  const data = await callTool<Record<string, unknown>>(
    userId,
    "jdParse",
    SYSTEM,
    `Job: ${title} at ${company}\n\n${description.slice(0, 16000)}`,
    JD_TOOL,
    2000,
  );

  return {
    title,
    company,
    mustHave: asStringArray(data.mustHave),
    niceToHave: asStringArray(data.niceToHave),
    responsibilities: asStringArray(data.responsibilities),
    hardKeywords: asStringArray(data.hardKeywords),
  };
}
