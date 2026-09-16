// "Refine with AI" on the search-preferences form: a bounded, two-step assist for the free-text
// criteria box, not a persistent chatbot. Step 1 asks 2-3 targeted follow-up questions based on
// what's filled in so far; step 2 folds the user's answers back into a single rewritten criteria
// paragraph. No new state is persisted — the caller still has to hit the form's own Save.
import { callTool, type LlmTool } from "./llm-client";

type DraftFields = {
  tracks: string[];
  gradYear?: string;
  locationsPreferred: string[];
  locationsAcceptable: string[];
  criteria: string;
};

const QUESTIONS_TOOL: LlmTool = {
  name: "ask_questions",
  description: "Ask 2-3 short, specific follow-up questions that would sharpen this job search.",
  input_schema: {
    type: "object",
    properties: {
      questions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
    },
    required: ["questions"],
  },
};

const CRITERIA_TOOL: LlmTool = {
  name: "submit_criteria",
  description: "Submit one rewritten criteria paragraph incorporating the candidate's answers.",
  input_schema: {
    type: "object",
    properties: { criteria: { type: "string" } },
    required: ["criteria"],
  },
};

function summarizeDraft(fields: DraftFields): string {
  return [
    `Tracks: ${fields.tracks.join(", ") || "(none yet)"}`,
    fields.gradYear ? `Grad year: ${fields.gradYear}` : null,
    `Preferred locations: ${fields.locationsPreferred.join(", ") || "(none yet)"}`,
    fields.locationsAcceptable.length ? `Also acceptable: ${fields.locationsAcceptable.join(", ")}` : null,
    fields.criteria.trim() ? `Current criteria notes: ${fields.criteria.trim()}` : "Current criteria notes: (blank)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateRefineQuestions(userId: string, fields: DraftFields): Promise<string[]> {
  const system =
    "You help a job seeker sharpen their search criteria. Given what they've filled in so far, ask a " +
    "small number of concrete follow-up questions that would help a search actually find better-fitting " +
    "jobs — company size, industry sub-verticals, deal-breakers, must-haves vs nice-to-haves, etc. Don't " +
    "ask about anything already covered by tracks/grad year/locations.";
  const { questions } = await callTool<{ questions: string[] }>(
    userId,
    "searchRefine",
    system,
    summarizeDraft(fields),
    QUESTIONS_TOOL,
    500,
  );
  return questions;
}

export async function applyRefineAnswers(
  userId: string,
  fields: DraftFields,
  qa: { question: string; answer: string }[],
): Promise<string> {
  const system =
    "Rewrite the candidate's job-search criteria into one clear paragraph, folding in their answers " +
    "below alongside whatever they'd already written. Keep it concise and concrete — this text is fed " +
    "directly into a job-search prompt.";
  const prompt = [
    summarizeDraft(fields),
    "",
    "Follow-up Q&A:",
    ...qa.map((x) => `Q: ${x.question}\nA: ${x.answer}`),
  ].join("\n");
  const { criteria } = await callTool<{ criteria: string }>(userId, "searchRefine", system, prompt, CRITERIA_TOOL, 500);
  return criteria;
}
