// LLM-graded scoring for Offer Runway jobs specifically — see the file comment on
// importOfferRunwayListings() for why this is scoped there and not the cron-ingested board (which
// keeps lib/match.ts's cheap keyword scorer: this app deliberately moved away from a per-job LLM
// call once ingest scaled to thousands of jobs, and that reasoning still holds for that board).
// Offer Runway is a small, hand-curated set, so a real LLM read per NEW job (see the
// already-matched guard in import-offer-runway.ts) is cheap and worth it.
//
// Modeled loosely on career-ops's (github.com/santifer/career-ops) A-F evaluation rubric — but
// honestly scoped: career-ops's comp/culture/red-flags/legitimacy blocks all depend on reading the
// actual posting page (it fetches via Playwright). jobschlob has no posting-fetch capability today
// (jd-parse.ts only parses text a user pastes in) — building that is a separate, bigger project.
// This scores fit against the CANDIDATE's own evidence bank and stated criteria, which is what's
// actually available for an Offer Runway listing (title/company/category/location only).
import { callTool, type LlmTool } from "./llm-client";
import { rankEvidenceBullets, serializeEvidenceBank } from "./evidence-rank";
import { isEmptyEvidenceBank, type EvidenceBank } from "./evidence";
import type { SearchPreferences } from "./search-preferences";

export type OfferRunwayScore = {
  score: number; // 1-5, same scale career-ops uses
  recommendation: "apply now" | "worth applying" | "marginal" | "skip";
  rationale: string;
};

const RECOMMENDATIONS = ["apply now", "worth applying", "marginal", "skip"] as const;

const SCORE_TOOL: LlmTool = {
  name: "emit_job_score",
  description: "Score how well this job posting fits the candidate, based on their evidence bank and stated search criteria.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 1, maximum: 5, description: "1=poor fit, 5=excellent fit — same scale a human career coach would use." },
      recommendation: { type: "string", enum: [...RECOMMENDATIONS] },
      rationale: {
        type: "string",
        description: "2-3 sentences: why this score, grounded in specific evidence-bank bullets or stated criteria matched or missed.",
      },
    },
    required: ["score", "recommendation", "rationale"],
  },
};

const SYSTEM =
  "You are a career coach scoring how well a job posting fits a candidate, using their evidence " +
  "bank (real, citable experience) and their stated search criteria. Only the posting's title, " +
  "company, category and location are available here — not the full job description — so ground " +
  "your score in fit against the CANDIDATE's background and criteria, not speculation about the " +
  "posting's compensation, culture or legitimacy. Be honest: a mediocre fit should score low, not " +
  "an inflated middling score out of politeness.";

export async function scoreOfferRunwayJob(
  userId: string,
  job: { title: string; company: string; category: string | null; location: string | null },
  evidenceBank: EvidenceBank | null,
  background: string,
  searchPreferences: SearchPreferences | null,
): Promise<OfferRunwayScore> {
  const hasBank = evidenceBank && !isEmptyEvidenceBank(evidenceBank);
  const evidenceBlock = hasBank
    ? serializeEvidenceBank(evidenceBank, rankEvidenceBullets(evidenceBank, undefined, searchPreferences))
    : background.trim() || "(no background on file)";

  const criteriaParts = [
    searchPreferences?.tracks?.length ? `Tracks of interest: ${searchPreferences.tracks.join(", ")}` : null,
    searchPreferences?.criteria ? `Other criteria: ${searchPreferences.criteria}` : null,
  ].filter(Boolean);
  const criteria = criteriaParts.length ? criteriaParts.join("\n") : "(none stated)";

  const prompt =
    `Job posting:\nTitle: ${job.title}\nCompany: ${job.company}\n` +
    `Category: ${job.category ?? "unknown"}\nLocation: ${job.location ?? "unknown"}\n\n` +
    `Candidate's evidence:\n${evidenceBlock}\n\nCandidate's stated search criteria:\n${criteria}`;

  const data = await callTool<{ score: number; recommendation: string; rationale: string }>(
    userId, "offerRunwayScore", SYSTEM, prompt, SCORE_TOOL, 800,
  );

  const recommendation = (RECOMMENDATIONS as readonly string[]).includes(data.recommendation)
    ? (data.recommendation as OfferRunwayScore["recommendation"])
    : "marginal";

  return {
    score: Math.max(1, Math.min(5, Math.round(data.score))),
    recommendation,
    rationale: data.rationale,
  };
}
