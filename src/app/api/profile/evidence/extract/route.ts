import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractPdfText } from "@/lib/ats-check";
import { extractEvidenceFromText } from "@/lib/evidence-extract";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

// Resume upload -> structured evidence, for a confirm-before-save preview on /profile (see
// /api/profile/evidence/save for the actual write). Deliberately does NOT touch
// profiles.evidenceBank itself — v1 is full-replace (see lib/evidence-extract.ts), so the caller
// gets a chance to look at what came out before it overwrites anything.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file given." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (8MB max)." }, { status: 413 });

  let text: string;
  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      text = await extractPdfText(Buffer.from(await file.arrayBuffer()));
    } else {
      text = await file.text();
    }
  } catch (err) {
    return NextResponse.json({ error: `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 });
  }

  if (text.trim().length < 40) {
    return NextResponse.json({ error: "Couldn't find readable text in that file — if it's a scanned PDF, it needs OCR first." }, { status: 422 });
  }

  try {
    const bank = await extractEvidenceFromText(userId, text, file.name);
    return NextResponse.json({ bank });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 502 });
  }
}
