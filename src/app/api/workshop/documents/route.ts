import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDocumentById, setActiveDocument, deleteDocument } from "@/db/queries";
import { fetchDocumentPdf, deleteDocumentPdf } from "@/lib/blob-storage";

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

  await setActiveDocument(userId, id);
  return NextResponse.json({ ok: true });
}
