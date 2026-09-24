// Shape of profiles.llm_config (jsonb) — no runtime dependencies, so both db/queries.ts and
// lib/llm-client.ts can import these types without a circular import between them.

export type LlmProcess =
  | "resume"
  | "coverLetter"
  | "jdParse"
  | "searchRefine"
  | "evidenceExtract"
  | "interviewQuestions"
  | "offerRunwayScore";
export type Provider = "anthropic" | "openai";

export type ProcessRoute = { provider: Provider; model?: string };

export type LlmConfig = {
  // Each value is lib/crypto.ts's encryptSecret() output — never a plaintext key, even here.
  keys?: { anthropic?: string; openai?: string };
  // Missing entry for a process = use the app's own default (today's behavior: Anthropic, the
  // app's env-var key, claude-sonnet-5).
  routing?: Partial<Record<LlmProcess, ProcessRoute>>;
};

export const LLM_PROCESSES: LlmProcess[] = [
  "resume",
  "coverLetter",
  "jdParse",
  "searchRefine",
  "evidenceExtract",
  "interviewQuestions",
  "offerRunwayScore",
];

export const PROCESS_LABELS: Record<LlmProcess, string> = {
  resume: "Resume generation",
  coverLetter: "Cover letter generation",
  jdParse: "Job description parsing",
  searchRefine: "Job search \"Refine with AI\"",
  evidenceExtract: "Resume → evidence bank extraction",
  interviewQuestions: "Profile follow-up questions",
  offerRunwayScore: "Offer Runway job scoring",
};
