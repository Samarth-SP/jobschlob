import {
  type ResumeData,
  type CoverLetterData,
  renderResume,
  renderCoverLetter,
  trimResume,
  trimCoverLetter,
} from "./resume-template";
import { compileLatex } from "./latex";
import { checkAts, type AtsNotes } from "./ats-check";
import { parseJobDescription, type ParsedJd } from "./jd-parse";
import { scoreResume, resumeToPlainText } from "./ats-score";
import { groundingCheckResume, groundingCheckCoverLetter } from "./grounding-check";
import { callTool, type LlmTool } from "./llm-client";

// Prompt-only anti-fabrication is a soft guardrail, not a guarantee (there's no mechanical check
// on the output against the background). Added after this exact model invented a plausible phone
// number, email, and GitHub handle for a background that simply didn't include contact info.
const ANTI_FABRICATION =
  "Only use facts present in the background text — never invent, estimate, or embellish a skill, " +
  "metric, employer, date, or contact detail (email, phone, GitHub, LinkedIn) that isn't literally there. " +
  "If a normally-expected fact is missing (e.g. no phone number given), use a bracketed placeholder like " +
  "[phone] rather than making one up. Tailoring means reordering and rephrasing what's real to foreground " +
  "the relevant parts, never adding content you weren't given.";

const ENTRY_ITEM = {
  type: "object" as const,
  properties: {
    organization: { type: "string" },
    location: { type: "string", description: 'City, ST — or "Remote". Empty string if genuinely unknown.' },
    role: { type: "string", description: "Job title (for experience) or the degree line, e.g. \"B.S. in Computer Science\" (for education)." },
    dates: { type: "string", description: 'e.g. "Jun. 2024 – Aug. 2024" or "Feb. 2025 – Present"' },
    bullets: {
      type: "array",
      items: { type: "string" },
      description:
        "MOST IMPRESSIVE FIRST. Experience: 1–3 bullets, ~1 line each (~25 words), fewer for older/less-relevant roles. Education: usually one line covering GPA / honors / relevant coursework. Trailing bullets may be dropped to fit one page.",
    },
  },
  required: ["organization", "location", "role", "dates", "bullets"],
};

const RESUME_TOOL: LlmTool = {
  name: "emit_resume",
  description:
    "Return the tailored resume as structured content. Layout, fonts and spacing are handled downstream — supply plain text only, no LaTeX or markdown. Sections render in the order education, experience, projects, skills.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      contact: {
        type: "array",
        items: { type: "string" },
        description:
          'Separate strings, rendered " | " separated: phone, email, then profile links like "linkedin.com/in/x" and "github.com/x". Only what the background literally contains.',
      },
      education: { type: "array", items: ENTRY_ITEM, description: "Usually one entry." },
      experience: {
        type: "array",
        items: ENTRY_ITEM,
        description: "At most the 4–5 most job-relevant roles, most recent / strongest first.",
      },
      projects: {
        type: "array",
        description: "Optional — only if the background describes projects and there's room after experience.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dates: { type: "string" },
            bullets: { type: "array", items: { type: "string" }, description: "1–3 bullets, strongest first." },
          },
          required: ["name", "dates", "bullets"],
        },
      },
      skills: {
        type: "array",
        description: 'Grouped by category — e.g. {"category": "Languages", "items": ["Python", "C++"]}. 4–8 groups.',
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            items: { type: "array", items: { type: "string" } },
          },
          required: ["category", "items"],
        },
      },
    },
    required: ["name", "contact", "education", "experience", "skills"],
  },
};

const COVER_TOOL: LlmTool = {
  name: "emit_cover_letter",
  description: "Return the cover letter as structured content. Supply text only, no LaTeX or markdown.",
  input_schema: {
    type: "object",
    properties: {
      sender: { type: "string", description: "The candidate's name." },
      senderContact: { type: "array", items: { type: "string" }, description: "Email / phone, only what the background contains." },
      recipient: { type: "string", description: 'e.g. "Hiring Team, Acme Corp"' },
      greeting: { type: "string", description: 'e.g. "Dear Hiring Team,"' },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        description: "2–3 short body paragraphs, strongest point first. The last may be dropped to fit one page.",
      },
      closing: { type: "string", description: 'e.g. "Sincerely,"' },
    },
    required: ["sender", "senderContact", "recipient", "greeting", "paragraphs", "closing"],
  },
};

const RESUME_SYSTEM =
  "You turn a candidate's background into a tailored, strictly single-page resume in a fixed template " +
  "(sections: education, experience, projects, skills — projects optional). Hard limits: at most 4–5 roles; " +
  "1–3 bullets per role, fewer for older/less-relevant ones; each bullet ONE line (~25 words) starting with a " +
  "strong past-tense verb, strongest bullet first so trimming from the end degrades gracefully. Favor depth on " +
  "recent, job-relevant work over listing everything. Skills grouped into 4–8 labelled categories. " +
  ANTI_FABRICATION;

const COVER_SYSTEM =
  "You write a concise, specific, single-page cover letter: 2–3 short paragraphs that connect this " +
  "candidate's real experience to this specific job. No filler, no restating the whole resume. " +
  ANTI_FABRICATION;

export type BuildResult = { latex: string; pdf: Buffer; warnings: string[]; atsNotes: AtsNotes };

// Render → compile → check (which also reports page count) → trim one line → repeat, until it
// fits one page or there's nothing left to cut. Returns the final compile + ATS result plus
// warnings noting anything trimmed. checkAts is reused for the count rather than a parallel
// pdfjs entry point — it already carries the Vercel-runtime worker/polyfill setup.
async function fitToOnePage(
  render: () => string,
  trim: () => string | null,
  kind: "resume" | "cover_letter",
): Promise<BuildResult> {
  const MAX_TRIMS = 15;
  const cut: string[] = [];
  let compiled = await compileLatex(render());
  let ats = await checkAts(compiled.pdf, kind);
  while ((ats.pageCount ?? 1) > 1 && cut.length < MAX_TRIMS) {
    const removed = trim();
    if (removed == null) break;
    cut.push(removed);
    compiled = await compileLatex(render());
    ats = await checkAts(compiled.pdf, kind);
  }
  const warnings = [...compiled.warnings];
  if (cut.length) warnings.push(`Trimmed ${cut.length} line(s) to fit one page: ${cut.map((c) => `“${c}”`).join("; ")}`);
  if ((ats.pageCount ?? 1) > 1)
    warnings.push(`Still ${ats.pageCount} pages after trimming — shorten your background or edit the source directly.`);
  return { latex: compiled.source, pdf: compiled.pdf, warnings, atsNotes: ats };
}

// JD parsing is advisory (feeds the keyword-score/grounding-echo checks below, not the
// generation itself) — a parse failure shouldn't take down the whole generate request, so this
// degrades to "no structured JD" rather than throwing.
async function tryParseJd(userId: string, job?: { title: string; company: string; description?: string }): Promise<ParsedJd | null> {
  if (!job?.description) return null;
  try {
    return await parseJobDescription(userId, job.description, job.title, job.company);
  } catch {
    return null;
  }
}

export async function buildResume(
  userId: string,
  background: string,
  job?: { title: string; company: string; description?: string },
): Promise<BuildResult> {
  const data = await callTool<ResumeData>(
    userId,
    "resume",
    RESUME_SYSTEM,
    `Background:\n\n${background}${job ? `\n\nTailor to this job: ${job.title} at ${job.company}${job.description ? `\n\n${job.description}` : ""}` : ""}`,
    RESUME_TOOL,
  );
  if (!data?.name || !Array.isArray(data.experience)) throw new Error("emit_resume: malformed resume data");

  const built = await fitToOnePage(
    () => renderResume(data),
    () => trimResume(data),
    "resume",
  );

  // Scored/checked against the FINAL (post-trim) content, using the same `data` object the
  // fitter mutated in place — a score computed before trimming could describe bullets that no
  // longer exist in the document that got saved.
  const jd = await tryParseJd(userId, job);
  const keywordScore = jd ? scoreResume(data, resumeToPlainText(data), jd) : undefined;
  const grounding = groundingCheckResume(data, background, jd);

  return { ...built, atsNotes: { ...built.atsNotes, keywordScore, grounding } };
}

export async function buildCoverLetter(
  userId: string,
  background: string,
  job: { title: string; company: string; description?: string },
): Promise<BuildResult> {
  const data = await callTool<CoverLetterData>(
    userId,
    "coverLetter",
    COVER_SYSTEM,
    `Background:\n\n${background}\n\nJob: ${job.title} at ${job.company}${job.description ? `\n\n${job.description}` : ""}`,
    COVER_TOOL,
  );
  if (!data?.sender || !Array.isArray(data.paragraphs)) throw new Error("emit_cover_letter: malformed cover letter data");

  const built = await fitToOnePage(
    () => renderCoverLetter(data),
    () => trimCoverLetter(data),
    "cover_letter",
  );

  // No keyword score for cover letters (BoofSimplify's ats.py scoring is resume-specific too) —
  // just the grounding check, which also screens for JD terms echoed back as the candidate's own.
  const jd = await tryParseJd(userId, job);
  const grounding = groundingCheckCoverLetter(data, background, jd);

  return { ...built, atsNotes: { ...built.atsNotes, grounding } };
}
