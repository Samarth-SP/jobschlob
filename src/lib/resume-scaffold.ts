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
import { type EvidenceBank, isEmptyEvidenceBank } from "./evidence";
import { rankEvidenceBullets, serializeEvidenceBank } from "./evidence-rank";
import type { SearchPreferences } from "./search-preferences";
import { getArchetype, styleBrief, type ResumeArchetype } from "./resume-archetypes";

// Prompt-only anti-fabrication is a soft guardrail, not a guarantee (there's no mechanical check
// on the output against the background). Added after this exact model invented a plausible phone
// number, email, and GitHub handle for a background that simply didn't include contact info.
const ANTI_FABRICATION =
  "Only use facts present in the material given below — never invent, estimate, or embellish a skill, " +
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
    "Return the tailored resume as structured content. Layout, fonts and spacing are handled downstream — supply plain text only, no LaTeX or markdown. Section order for this role family is given in the system prompt; only populate a section this resume actually renders.",
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
      leadership: {
        type: "array",
        description: "Optional — clubs, activities, volunteering, leadership roles (not paid employment). Only if the system prompt's section order includes it and the evidence supports one.",
        items: ENTRY_ITEM,
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

// Archetype-parameterized: the physical constraints (one page, bullet length/count, trimming
// behavior) never change — they're properties of the fixed LaTeX template — but which sections
// exist, in what order, and what the bullets should emphasize come from the selected archetype
// (lib/resume-archetypes.ts) so the model's content choices actually match what the template will
// render, instead of every generation being shaped for the old hardcoded education/experience/
// projects/skills order regardless of role family.
function resumeSystem(archetype: ResumeArchetype): string {
  return (
    "You turn a candidate's evidence into a tailored, strictly single-page resume in a fixed visual " +
    "template — you choose section order and content, never layout, fonts or spacing. Hard limits: at " +
    "most 4–5 roles; 1–3 bullets per role, fewer for older/less-relevant ones; each bullet ONE line " +
    "(~25 words) starting with a strong past-tense verb, strongest bullet first so trimming from the " +
    "end degrades gracefully. Favor depth on recent, job-relevant work over listing everything. Skills " +
    "grouped into 4–8 labelled categories.\n\n" +
    styleBrief(archetype) +
    "\n\n" +
    ANTI_FABRICATION
  );
}

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

// When an evidence bank is present, the JD has to be parsed BEFORE generation (not just for
// post-hoc scoring, as before) so its keywords can rank which bullets the model even sees —
// see evidence-rank.ts. A job-less "generalized" resume still ranks (recency + whether a bullet
// carries a number + a soft nudge from the user's own stated search preferences) rather than
// handing over an unranked dump.
function contentBlock(
  background: string,
  evidenceBank: EvidenceBank | null | undefined,
  jd: ParsedJd | null,
  prefs: SearchPreferences | null | undefined,
): { label: string; text: string; usedBank: boolean } {
  if (evidenceBank && !isEmptyEvidenceBank(evidenceBank)) {
    const ranked = rankEvidenceBullets(evidenceBank, jd ?? undefined, prefs);
    return { label: "Evidence bank", text: serializeEvidenceBank(evidenceBank, ranked), usedBank: true };
  }
  return { label: "Background", text: background, usedBank: false };
}

export async function buildResume(
  userId: string,
  background: string,
  job?: { title: string; company: string; description?: string },
  evidenceBank?: EvidenceBank | null,
  prefs?: SearchPreferences | null,
  archetypeKey?: string | null,
): Promise<BuildResult> {
  const archetype = getArchetype(archetypeKey);
  const jd = await tryParseJd(userId, job);
  const content = contentBlock(background, evidenceBank, jd, prefs);

  const data = await callTool<ResumeData>(
    userId,
    "resume",
    resumeSystem(archetype),
    `${content.label}:\n\n${content.text}${job ? `\n\nTailor to this job: ${job.title} at ${job.company}${job.description ? `\n\n${job.description}` : ""}` : ""}`,
    RESUME_TOOL,
  );
  if (!data?.name || !Array.isArray(data.experience)) throw new Error("emit_resume: malformed resume data");

  const built = await fitToOnePage(
    () => renderResume(data, archetype.sectionOrder),
    () => trimResume(data, archetype.trimPriority),
    "resume",
  );

  // Scored/checked against the FINAL (post-trim) content, using the same `data` object the
  // fitter mutated in place — a score computed before trimming could describe bullets that no
  // longer exist in the document that got saved.
  const keywordScore = jd ? scoreResume(data, resumeToPlainText(data), jd) : undefined;
  // Ground truth for the anti-fabrication check is background + the evidence-bank digest (when
  // used) — checking against background alone would flag a real bank-only fact as invented.
  const groundTruth = content.usedBank ? `${background}\n\n${content.text}` : background;
  const grounding = groundingCheckResume(data, groundTruth, jd);

  return { ...built, atsNotes: { ...built.atsNotes, keywordScore, grounding } };
}

export async function buildCoverLetter(
  userId: string,
  background: string,
  job: { title: string; company: string; description?: string },
  evidenceBank?: EvidenceBank | null,
  prefs?: SearchPreferences | null,
): Promise<BuildResult> {
  const jd = await tryParseJd(userId, job);
  const content = contentBlock(background, evidenceBank, jd, prefs);

  const data = await callTool<CoverLetterData>(
    userId,
    "coverLetter",
    COVER_SYSTEM,
    `${content.label}:\n\n${content.text}\n\nJob: ${job.title} at ${job.company}${job.description ? `\n\n${job.description}` : ""}`,
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
  const groundTruth = content.usedBank ? `${background}\n\n${content.text}` : background;
  const grounding = groundingCheckCoverLetter(data, groundTruth, jd);

  return { ...built, atsNotes: { ...built.atsNotes, grounding } };
}
