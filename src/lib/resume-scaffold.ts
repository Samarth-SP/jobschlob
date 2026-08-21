import Anthropic from "@anthropic-ai/sdk";
import { RESUME_EXEMPLAR, COVER_LETTER_EXEMPLAR } from "./resume-template";

const client = new Anthropic();

const ALLOWED_PACKAGES =
  "geometry, fontenc (T1), enumitem, titlesec, xcolor, hyperref — the same packages used in the example, already available offline. Do not use any other package.";

// Prompt-only anti-fabrication is a soft guardrail, not a guarantee (there's no mechanical check
// on the output against the background the way a real ATS pipeline would want — see CLAUDE.md's
// Scoring section for why that tradeoff was made here). Added after this exact model invented a
// plausible-looking phone number, email, and GitHub/LinkedIn handle for a background that simply
// didn't include contact info — the failure mode this is meant to close off.
const ANTI_FABRICATION =
  "Only use facts present in the background text below — never invent, estimate, or embellish a skill, " +
  "metric, employer, dates, or contact detail (email, phone, GitHub, LinkedIn) that isn't literally there. " +
  "If the background is missing a fact a resume normally has (e.g. no phone number given), leave a bracketed " +
  "placeholder like [phone] rather than making one up. Tailoring to the job means reordering and rephrasing " +
  "what's real to foreground the relevant parts, never adding content that wasn't given to you.";

function extractLatex(text: string): string {
  const fenced = text.match(/```(?:latex|tex)?\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function generateResumeLatex(background: string, jobDescription?: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system: `You write single-page, ATS-friendly LaTeX resumes. Only use these packages: ${ALLOWED_PACKAGES} ${ANTI_FABRICATION} Output only the complete .tex document, no explanation, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Here is an example of the house style:\n\n${RESUME_EXEMPLAR}\n\nNow write a new resume in this same style, scaffolded from this background:\n\n${background}${
          jobDescription ? `\n\nTailor it to this job posting:\n\n${jobDescription}` : ""
        }`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no text in resume generation response");
  return extractLatex(block.text);
}

export async function generateCoverLetterLatex(
  background: string,
  job: { title: string; company: string; description?: string },
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system: `You write concise, specific LaTeX cover letters. Only use these packages: ${ALLOWED_PACKAGES} ${ANTI_FABRICATION} Output only the complete .tex document, no explanation, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Here is an example of the house style:\n\n${COVER_LETTER_EXEMPLAR}\n\nNow write a new cover letter in this same style, scaffolded from this background:\n\n${background}\n\nFor this job: ${job.title} at ${job.company}${
          job.description ? `\n\n${job.description}` : ""
        }`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no text in cover letter generation response");
  return extractLatex(block.text);
}
