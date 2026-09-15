import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { getApplyTaskDocument } from "@/db/queries";
import { fetchDocumentPdf } from "@/lib/blob-storage";

export const runtime = "nodejs";

// Streams a queued task's tailored-resume PDF to the local worker — addressed by taskId (not a
// bare documentId) so the worker can only ever fetch a document it was actually handed via
// /api/apply/queue, re-checked against the token's own user here too.
export async function GET(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const taskId = Number(new URL(req.url).searchParams.get("taskId"));
  if (!Number.isFinite(taskId)) return NextResponse.json({ error: "invalid taskId" }, { status: 400 });

  const doc = await getApplyTaskDocument(userId, taskId);
  if (!doc?.blobUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

  const blob = await fetchDocumentPdf(doc.blobUrl);
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.filename ?? "resume.pdf"}"`,
    },
  });
}
