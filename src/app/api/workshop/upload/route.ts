import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJobById, saveDocument, setActiveDocument } from "@/db/queries";
import { uploadDocumentPdf, UploadTooLargeError } from "@/lib/blob-storage";
import { checkAts } from "@/lib/ats-check";

export const runtime = "nodejs";

// Upload an already-tailored PDF resume/cover letter (as opposed to /api/workshop/generate's
// scaffold-from-background flow) — for a resume optimized outside jobschlob that should still
// live in the same workshop library. Newly uploaded documents become the active one for their
// kind immediately (see setActiveDocument); the user can switch which one's active afterward.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "cover_letter" ? "cover_letter" : "resume";
  const jobId = typeof form.get("jobId") === "string" ? (form.get("jobId") as string) || undefined : undefined;

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });

  const job = jobId ? await getJobById(jobId) : null;
  const buffer = Buffer.from(await file.arrayBuffer());

  let blobUrl: string;
  try {
    blobUrl = await uploadDocumentPdf(userId, kind, file.name, buffer);
  } catch (err) {
    if (err instanceof UploadTooLargeError) return NextResponse.json({ error: err.message }, { status: 413 });
    throw err;
  }

  const atsNotes = await checkAts(buffer, kind);
  const saved = await saveDocument({
    userId,
    jobId: job?.id ?? null,
    kind,
    source: "uploaded",
    blobUrl,
    filename: file.name,
    atsNotes,
  });
  await setActiveDocument(userId, saved.id);

  return NextResponse.json({ id: saved.id, filename: saved.filename, kind, latex: null, atsNotes });
}
