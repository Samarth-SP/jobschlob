// Follow-up questions that turn thin evidence into resume-grade detail — ported from
// BoofSimplify's boof/profile/interview.py, using this app's own established two-step-assist
// shape (mirrors lib/search-refine.ts exactly: ask_questions tool, then a submit tool for the
// answers, no new persistence mechanism).
//
// Non-negotiable rule, hit as a real bug once already in the BoofSimplify port: an experience/
// project/leadership answer is folded into its entry BY ID, extracting bullets scoped to that one
// entry only. It must never re-run a generic extraction that re-derives org/title from freeform
// Q&A text — an LLM re-splitting a messy resume's org/title differently than the original creates
// a duplicate entry instead of merging, even when the underlying data just has an unusual split.
import { callTool, type LlmTool } from "./llm-client";
import { type EvidenceBank, assignEvidenceIds } from "./evidence";

export type GapKind = "experiences" | "projects" | "leadership" | "fact";
export type Gap = { kind: GapKind; id: string; label: string; org: string; reason: string; score: number };

const MIN_BULLETS = 2;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function bulletIsThin(b: { text: string; metrics: string[] }): boolean {
  return b.metrics.length === 0 && wordCount(b.text) < 14;
}

// Content-derived, stable across a find→answer round trip without needing a persisted id for
// rawFacts (which are bare strings, unlike bullets/entries).
function factId(fact: string): string {
  return "fact_" + Buffer.from(fact).toString("base64url").slice(0, 16);
}

// Pure heuristic, no LLM call — cheap enough to run on every profile page load.
export function findGaps(bank: EvidenceBank): Gap[] {
  const gaps: Gap[] = [];

  (["experiences", "projects", "leadership"] as const).forEach((section) => {
    for (const item of bank[section]) {
      if (!item.bullets.length) continue;
      const thin = item.bullets.filter(bulletIsThin).length;
      if (thin === 0 && item.bullets.length >= MIN_BULLETS) continue;
      const reason =
        item.bullets.length < MIN_BULLETS ? `only ${item.bullets.length} bullet(s)` : `${thin} bullet(s) with no concrete outcome`;
      gaps.push({
        kind: section,
        id: item.id,
        label: item.title || item.org || "untitled",
        org: item.org,
        reason,
        score: Math.max(0, MIN_BULLETS - item.bullets.length) + thin,
      });
    }
  });

  for (const fact of bank.rawFacts) {
    const words = wordCount(fact);
    // Below the floor it's a bare data point (a GPA, a date) with nothing to ask about; at or
    // above the ceiling it's already a real sentence.
    if (words >= 6 && words < 18) {
      gaps.push({ kind: "fact", id: factId(fact), label: fact, org: "", reason: "mentioned but not expanded", score: 1 });
    }
  }

  gaps.sort((a, b) => b.score - a.score);
  return gaps.slice(0, 8);
}

const QUESTIONS_TOOL: LlmTool = {
  name: "ask_questions",
  description: "Ask 2-4 short, concrete follow-up questions that would let a resume writer add real, specific evidence.",
  input_schema: {
    type: "object",
    properties: { questions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
    required: ["questions"],
  },
};

const QUESTIONS_SYSTEM =
  "You help build a job seeker's evidence bank by asking sharp follow-up questions. You are given what " +
  "is already on file for one entry. Ask only what a hiring manager would actually want to know that " +
  "ISN'T already stated — never ask about something the context already answers.";

function entryContext(bank: EvidenceBank, gap: Gap): string | null {
  if (gap.kind === "fact") return gap.label;
  const item = bank[gap.kind].find((it) => it.id === gap.id);
  if (!item) return null;
  const head = item.org ? `${item.title} — ${item.org}` : item.title;
  return [head, ...item.bullets.map((b) => `- ${b.text}`)].join("\n");
}

export async function generateFollowupQuestions(userId: string, bank: EvidenceBank, gap: Gap): Promise<string[]> {
  const context = entryContext(bank, gap);
  if (!context) return [];
  const prompt =
    `Here is what's on file for this entry:\n\n${context}\n\nThis is thin: ${gap.reason}\n\n` +
    "Favor questions about: the approach or method used, what was actually shipped or delivered, the " +
    "scale or scope, and any number (time saved, cost, throughput, team size, adoption, accuracy). Do " +
    'not ask generic questions like "tell me more" — ask about the specific thing named above.';
  const { questions } = await callTool<{ questions: string[] }>(userId, "interviewQuestions", QUESTIONS_SYSTEM, prompt, QUESTIONS_TOOL, 500);
  return questions ?? [];
}

const BULLET_TOOL: LlmTool = {
  name: "emit_bullets",
  description: "Turn interview answers into 1-3 additional resume bullets for ONE existing entry.",
  input_schema: {
    type: "object",
    properties: {
      bullets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            skills: { type: "array", items: { type: "string" } },
            metrics: { type: "array", items: { type: "string" } },
          },
          required: ["text"],
        },
      },
    },
    required: ["bullets"],
  },
};

const BULLET_SYSTEM =
  "You turn interview answers into resume bullets for ONE existing entry. Use only what the answers " +
  "state — never invent numbers, tools, scope or context beyond what's given. Preserve every number " +
  "exactly as written. Do not restate what the existing bullets already say. If an answer adds nothing " +
  "beyond what's already stated, skip it.";

const FACT_TOOL: LlmTool = {
  name: "emit_expanded_fact",
  description: "Rewrite one under-specified fact into a fuller statement using the interview answers.",
  input_schema: {
    type: "object",
    properties: { fact: { type: "string", description: "One sentence, folding in the new detail. Never invent beyond what's given." } },
    required: ["fact"],
  },
};

const FACT_SYSTEM =
  "You expand one under-specified fact about a job seeker using their interview answers. Use only what " +
  "the answers state — never invent detail beyond what's given.";

function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function applyFollowupAnswers(
  userId: string,
  bank: EvidenceBank,
  gap: Gap,
  qa: { question: string; answer: string }[],
): Promise<EvidenceBank> {
  const pairs = qa.filter((x) => x.answer.trim());
  if (!pairs.length) return bank;
  const qaText = pairs.map((x) => `Q: ${x.question}\nA: ${x.answer.trim()}`).join("\n");

  const kind = gap.kind;
  if (kind === "fact") {
    const prompt = `Original fact: ${gap.label}\n\nInterview answers:\n${qaText}`;
    const { fact } = await callTool<{ fact: string }>(userId, "interviewQuestions", FACT_SYSTEM, prompt, FACT_TOOL, 500);
    const next = (fact || "").trim();
    return { ...bank, rawFacts: bank.rawFacts.map((f) => (f === gap.label ? next || f : f)) };
  }

  const item = bank[kind].find((it) => it.id === gap.id);
  if (!item) return bank;
  const head = item.org ? `${item.title} — ${item.org}` : item.title;
  const existing = item.bullets.map((b) => `- ${b.text}`).join("\n") || "(none yet)";
  const prompt = `Entry: ${head}\nExisting bullets:\n${existing}\n\nNew interview answers:\n${qaText}`;
  const { bullets } = await callTool<{ bullets: { text: string; skills?: string[]; metrics?: string[] }[] }>(
    userId,
    "interviewQuestions",
    BULLET_SYSTEM,
    prompt,
    BULLET_TOOL,
    1000,
  );

  const newBullets = (bullets ?? [])
    .map((b) => ({ id: "", text: (b.text || "").trim(), skills: b.skills ?? [], metrics: b.metrics ?? [], source: `interview:${item.id}` }))
    .filter((b) => b.text && !item.bullets.some((ex) => normText(ex.text) === normText(b.text)));

  item.bullets.push(...newBullets);
  return assignEvidenceIds(bank);
}
