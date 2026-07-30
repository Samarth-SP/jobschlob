import Anthropic from "@anthropic-ai/sdk";
import { RESUME_EXEMPLAR, COVER_LETTER_EXEMPLAR } from "./resume-template";

const client = new Anthropic();

const ALLOWED_PACKAGES =
  "geometry, fontenc (T1), enumitem, titlesec, xcolor, hyperref — the same packages used in the example, already available offline. Do not use any other package.";

function extractLatex(text: string): string {
  const fenced = text.match(/```(?:latex|tex)?\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function generateResumeLatex(background: string, jobDescription?: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    system: `You write single-page, ATS-friendly LaTeX resumes. Only use these packages: ${ALLOWED_PACKAGES} Output only the complete .tex document, no explanation, no markdown fences.`,
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
    system: `You write concise, specific LaTeX cover letters. Only use these packages: ${ALLOWED_PACKAGES} Output only the complete .tex document, no explanation, no markdown fences.`,
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
