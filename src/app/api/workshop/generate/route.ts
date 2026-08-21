import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProfile, getJobById, saveDocument, setActiveDocument } from "@/db/queries";
import { generateResumeLatex, generateCoverLetterLatex } from "@/lib/resume-scaffold";
import { compileLatex } from "@/lib/latex";
import { checkAts } from "@/lib/ats-check";
import { uploadDocumentPdf } from "@/lib/blob-storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const body = await req.json();
  const kind: "resume" | "cover_letter" = body.kind === "cover_letter" ? "cover_letter" : "resume";
  const jobId: string | undefined = body.jobId || undefined;

  const background = await getProfile(userId);
  if (!background.trim()) {
    return NextResponse.json({ error: "Set your background in your profile first." }, { status: 400 });
  }

  const job = jobId ? await getJobById(jobId) : null;

  const latex =
    kind === "cover_letter"
      ? await generateCoverLetterLatex(background, job ? { title: job.title, company: job.company } : { title: "the role", company: "the company" })
      : await generateResumeLatex(background, job ? `${job.title} at ${job.company}` : undefined);

  const pdf = await compileLatex(latex);
  const atsNotes = await checkAts(pdf, kind);

  // Stored alongside latex (not just recompiled on demand) so a generated document lives in the
  // document library exactly like an uploaded one — same panel, same viewer, same re-scan path —
  // instead of being a one-off preview that vanishes once you navigate away.
  const filename = `${kind === "cover_letter" ? "cover-letter" : "resume"}${job ? `-${job.company}` : ""}.pdf`;
  const blobUrl = await uploadDocumentPdf(userId, kind, filename, pdf);

  const saved = await saveDocument({ userId, jobId: job?.id ?? null, kind, source: "generated", latex, blobUrl, filename, atsNotes });
  await setActiveDocument(userId, saved.id);

  return NextResponse.json({ id: saved.id, filename: saved.filename, kind, latex, atsNotes });
}
