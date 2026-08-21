import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJobById, saveDocument, setActiveDocument } from "@/db/queries";
import { uploadDocumentPdf, UploadTooLargeError } from "@/lib/blob-storage";
import { checkAts } from "@/lib/ats-check";
import { compileLatex } from "@/lib/latex";

export const runtime = "nodejs";

// Upload an already-tailored document (as opposed to /api/workshop/generate's scaffold-from-
// background flow) — for a resume optimized outside jobschlob that should still live in, and be
// editable from, the same workshop library. A .tex file is required: a bare PDF has no source to
// workshop, which defeats the entire point of the panel's in-place editor. A .pdf is optional —
// give us one and it's stored as-is (e.g. it was rendered by a different toolchain and might not
// round-trip through our Tectonic build identically); skip it and we compile the .tex ourselves.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const form = await req.formData();
  const texFile = form.get("tex");
  const pdfFile = form.get("pdf");
  const kind = form.get("kind") === "cover_letter" ? "cover_letter" : "resume";
  const jobId = typeof form.get("jobId") === "string" ? (form.get("jobId") as string) || undefined : undefined;

  if (!(texFile instanceof File) || !texFile.name.toLowerCase().endsWith(".tex")) {
    return NextResponse.json({ error: "A .tex file is required." }, { status: 400 });
  }
  if (pdfFile !== null && !(pdfFile instanceof File && pdfFile.type === "application/pdf")) {
    return NextResponse.json({ error: "The optional second file must be a PDF." }, { status: 400 });
  }

  const job = jobId ? await getJobById(jobId) : null;
  const latex = await texFile.text();
  const filename = pdfFile instanceof File ? pdfFile.name : texFile.name.replace(/\.tex$/i, ".pdf");

  let pdf: Buffer;
  if (pdfFile instanceof File) {
    pdf = Buffer.from(await pdfFile.arrayBuffer());
  } else {
    // compileLatex's Tectonic cache is warmed only for the small package set our own templates
    // use (see lib/resume-scaffold.ts's ALLOWED_PACKAGES) — an arbitrary external .tex (a
    // different Overleaf template, say) can easily use packages outside that set, or even
    // engine-specific primitives Tectonic's default engine doesn't support at all. That's a real
    // compile failure, not a bug to swallow — tell the user plainly instead of a raw 500.
    try {
      pdf = await compileLatex(latex);
    } catch {
      return NextResponse.json(
        { error: "This .tex file didn't compile in our sandbox (unsupported package or command). Upload the compiled PDF alongside it instead." },
        { status: 422 },
      );
    }
  }

  let blobUrl: string;
  try {
    blobUrl = await uploadDocumentPdf(userId, kind, filename, pdf);
  } catch (err) {
    if (err instanceof UploadTooLargeError) return NextResponse.json({ error: err.message }, { status: 413 });
    throw err;
  }

  const atsNotes = await checkAts(pdf, kind);
  const saved = await saveDocument({
    userId,
    jobId: job?.id ?? null,
    kind,
    source: "uploaded",
    latex,
    blobUrl,
    filename,
    atsNotes,
  });
  await setActiveDocument(userId, saved.id);

  return NextResponse.json({ id: saved.id, filename: saved.filename, kind, latex, atsNotes });
}
