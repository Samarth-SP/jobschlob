// LLM-powered job discovery: given a user's own search preferences, actually search the web for
// matching postings (unlike scripts/ingest.ts, which only scrapes a fixed roster of public ATS
// APIs) and add them to the same shared `jobs` table everyone reads from. Runs on the searching
// user's own Anthropic key (see lib/llm-client.ts's runWebSearchTool) — never the app's shared
// key, so this per-user feature can't run up the app owner's API bill.
import { runWebSearchTool, type LlmTool } from "./llm-client";
import { jobId } from "./dedupe";
import { getProfile, getSearchPreferences, upsertJobs, saveJobMatches } from "@/db/queries";
import { jobs } from "@/db/schema";
import type { SearchPreferences } from "./search-preferences";

type FoundJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  category: string;
  salary?: string;
  notes?: string;
  matchScore: number; // 0-100
  matchRationale: string;
};

const JOB_SEARCH_TOOL: LlmTool = {
  name: "submit_jobs",
  description: "Submit the job postings found, each scored for fit against the candidate's own criteria.",
  input_schema: {
    type: "object",
    properties: {
      jobs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            url: { type: "string", description: "Direct link to the posting or application page." },
            location: { type: "string" },
            category: { type: "string", description: "One of the candidate's own track names, or a close fit." },
            salary: { type: "string" },
            notes: { type: "string", description: "Anything worth flagging — deadline, fit caveats, etc." },
            matchScore: { type: "integer", minimum: 0, maximum: 100 },
            matchRationale: { type: "string", description: "Why this posting fits the candidate's stated criteria." },
          },
          required: ["company", "role", "url", "category", "matchScore", "matchRationale"],
        },
      },
    },
    required: ["jobs"],
  },
};

function buildPrompt(prefs: SearchPreferences, background: string): { system: string; prompt: string } {
  const system =
    "You are a job-search researcher. Search the web for real, currently-open job postings that " +
    "match the candidate's stated criteria, then call submit_jobs exactly once with what you found. " +
    "Only include postings you actually found live URLs for — never invent a listing or a URL.";

  const lines = [
    `Tracks/categories of interest: ${prefs.tracks.join(", ") || "(none specified)"}`,
    prefs.gradYear ? `Graduation year: ${prefs.gradYear}` : null,
    `Preferred locations: ${prefs.locationsPreferred.join(", ") || "(none specified)"}`,
    prefs.locationsAcceptable.length ? `Also acceptable: ${prefs.locationsAcceptable.join(", ")}` : null,
    prefs.remoteOk ? "Remote is acceptable." : null,
    prefs.criteria ? `Other criteria: ${prefs.criteria}` : null,
    background.trim() ? `Candidate background:\n${background.trim()}` : null,
  ].filter(Boolean);

  return { system, prompt: lines.join("\n") };
}

export async function runJobSearchForProfile(userId: string): Promise<{ found: number }> {
  const prefs = await getSearchPreferences(userId);
  if (!prefs?.enabled) return { found: 0 };

  const background = await getProfile(userId);
  const { system, prompt } = buildPrompt(prefs, background);
  const { jobs: found } = await runWebSearchTool<{ jobs: FoundJob[] }>(userId, system, prompt, JOB_SEARCH_TOOL);

  const source = `llm-search:${userId}`;
  const rows: (typeof jobs.$inferInsert)[] = found.map((j) => ({
    id: jobId(source, `${j.company}|${j.role}|${j.url}`),
    title: j.role,
    company: j.company,
    location: j.location ?? null,
    url: j.url,
    source,
    category: j.category,
    level: null,
    degreeLevel: null,
    postedAt: null,
  }));
  await upsertJobs(rows);

  await saveJobMatches(
    rows.map((row, i) => ({
      userId,
      jobId: row.id,
      score: Math.max(0, Math.min(100, Math.round(found[i].matchScore))),
      rationale: found[i].matchRationale,
    })),
  );

  return { found: rows.length };
}
