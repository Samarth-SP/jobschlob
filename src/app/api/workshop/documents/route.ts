import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDocumentById, setActiveDocument, deleteDocument, updateDocumentContent } from "@/db/queries";
import { fetchDocumentPdf, deleteDocumentPdf, uploadDocumentPdf } from "@/lib/blob-storage";
import { compileLatex } from "@/lib/latex";
import { checkAts } from "@/lib/ats-check";

export const runtime = "nodejs";

// Streams a stored PDF back through the app rather than exposing the private blob URL directly
// — the blob store requires the server-side token to read, so the browser can't hit it anyway.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  const doc = Number.isFinite(id) ? await getDocumentById(session.user.email, id) : null;
  if (!doc || !doc.blobUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

  const blob = await fetchDocumentPdf(doc.blobUrl);
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename ?? "document.pdf"}"`,
      // The panel force-reloads this after a recompile by cache-busting the URL, but an
      // intermediate cache holding onto the old bytes under the *same* URL would still be wrong.
      "Cache-Control": "private, no-cache",
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const body = await req.json();
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  if (body.action === "delete") {
    const deleted = await deleteDocument(userId, id);
    if (deleted?.blobUrl) await deleteDocumentPdf(deleted.blobUrl);
    return NextResponse.json({ ok: true });
  }

  // In-place editing: the user tweaks wording in the panel's LaTeX editor, this recompiles it to
  // a fresh PDF, re-runs the ATS check against that fresh PDF (not the stale one), and replaces
  // the stored blob — so "modify in place" actually updates what Set active/View serve, not just
  // the latex column.
  if (body.action === "recompile") {
    const doc = await getDocumentById(userId, id);
    if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
    const latex = typeof body.latex === "string" ? body.latex : doc.latex;
    if (!latex) return NextResponse.json({ error: "No LaTeX source on this document." }, { status: 400 });

    const pdf = await compileLatex(latex);
    const atsNotes = await checkAts(pdf, doc.kind === "cover_letter" ? "cover_letter" : "resume");
    const blobUrl = await uploadDocumentPdf(userId, doc.kind, doc.filename ?? `${doc.kind}.pdf`, pdf);
    if (doc.blobUrl) await deleteDocumentPdf(doc.blobUrl);
    await updateDocumentContent(userId, id, { latex, blobUrl, atsNotes });
    return NextResponse.json({ ok: true, atsNotes });
  }

  // Re-run the ATS check against whatever PDF is currently stored, without changing it — mainly
  // useful for an uploaded document (no latex to recompile from) that the user wants re-checked.
  if (body.action === "rescan") {
    const doc = await getDocumentById(userId, id);
    if (!doc?.blobUrl) return NextResponse.json({ error: "not found" }, { status: 404 });
    const blob = await fetchDocumentPdf(doc.blobUrl);
    if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "not found" }, { status: 404 });
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    const atsNotes = await checkAts(buffer, doc.kind === "cover_letter" ? "cover_letter" : "resume");
    await updateDocumentContent(userId, id, { atsNotes });
    return NextResponse.json({ ok: true, atsNotes });
  }

  await setActiveDocument(userId, id);
  return NextResponse.json({ ok: true });
}
