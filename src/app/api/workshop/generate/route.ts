import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProfile, getJobById, saveDocument, setActiveDocument } from "@/db/queries";
import { buildResume, buildCoverLetter } from "@/lib/resume-scaffold";
import { LatexCompileError } from "@/lib/latex";
import { uploadDocumentPdf } from "@/lib/blob-storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const body = await req.json();
  const kind: "resume" | "cover_letter" = body.kind === "cover_letter" ? "cover_letter" : "resume";
  const jobId: string | undefined = body.jobId || undefined;
  // Free-text, pasted in by the user at generation time — not stored anywhere (the `jobs` table
  // is a keyword-matched board, not a JD store; see lib/jd-parse.ts). Feeds the keyword-score and
  // grounding checks in lib/ats-score.ts / lib/grounding-check.ts; the previous title/company-only
  // path is unaffected when it's omitted.
  const jobDescription: string | undefined = typeof body.jobDescription === "string" && body.jobDescription.trim() ? body.jobDescription.trim() : undefined;

  const background = await getProfile(userId);
  if (!background.trim()) {
    return NextResponse.json({ error: "Set your background in your profile first." }, { status: 400 });
  }

  const job = jobId ? await getJobById(jobId) : null;
  const jobInfo = job
    ? { title: job.title, company: job.company, description: jobDescription }
    : jobDescription
      ? { title: "the role", company: "the company", description: jobDescription }
      : undefined;

  // The model returns structured content (never LaTeX); lib/resume-scaffold.ts fills the fixed
  // house template and runs a compile → count-pages → trim loop until it fits one page. A
  // LatexCompileError here would mean the template itself is broken — surface it cleanly rather
  // than as an uncaught 500.
  let pdf: Buffer, latex: string, warnings: string[], atsNotes;
  try {
    ({ latex, pdf, warnings, atsNotes } =
      kind === "cover_letter"
        ? await buildCoverLetter(background, jobInfo ?? { title: "the role", company: "the company" })
        : await buildResume(background, jobInfo));
  } catch (err) {
    if (err instanceof LatexCompileError) return NextResponse.json({ error: `Generation produced invalid LaTeX: ${err.message}` }, { status: 502 });
    throw err;
  }

  // Stored alongside latex (not just recompiled on demand) so a generated document lives in the
  // document library exactly like an uploaded one — same panel, same viewer, same re-scan path —
  // instead of being a one-off preview that vanishes once you navigate away.
  const filename = `${kind === "cover_letter" ? "cover-letter" : "resume"}${job ? `-${job.company}` : ""}.pdf`;
  const blobUrl = await uploadDocumentPdf(userId, kind, filename, pdf);

  const saved = await saveDocument({ userId, jobId: job?.id ?? null, kind, source: "generated", latex, blobUrl, filename, atsNotes });
  await setActiveDocument(userId, saved.id);

  return NextResponse.json({ id: saved.id, filename: saved.filename, kind, latex, atsNotes, warnings });
}
