import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setEvidenceBank } from "@/db/queries";
import { assignEvidenceIds, type EvidenceBank } from "@/lib/evidence";

export const runtime = "nodejs";

// Commits a bank the user has already reviewed (from /api/profile/evidence/extract, or an
// interview-answer patch from /api/profile/evidence/interview/answer) as profiles.evidence_bank.
// Full-replace, by design — see lib/evidence-extract.ts's file comment for why v1 doesn't merge.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const body = await req.json();
  const bank = body?.bank as EvidenceBank | undefined;
  if (!bank || typeof bank !== "object") return NextResponse.json({ error: "No evidence bank given." }, { status: 400 });

  await setEvidenceBank(userId, assignEvidenceIds(bank));
  return NextResponse.json({ ok: true });
}
