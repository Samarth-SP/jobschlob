import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { saveEvidenceBankAndRescore } from "@/lib/save-evidence-bank";
import type { EvidenceBank } from "@/lib/evidence";

export const runtime = "nodejs";

// Bearer-token equivalent of /api/profile/evidence/save, for the local BoofSimplify worker
// (boof/remote.py's push_evidence_bank(), called from sync()) — boof is the one place evidence
// actually gets edited (its own /profile page, plus the follow-up-interview feature), so this
// mirrors that whole bank up here on every sync. Full-replace is correct here, not a limitation:
// boof always sends its current complete bank.
export async function POST(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const bank = body?.bank as EvidenceBank | undefined;
  if (!bank || typeof bank !== "object") return NextResponse.json({ error: "No evidence bank given." }, { status: 400 });

  const { rescored } = await saveEvidenceBankAndRescore(userId, bank);
  return NextResponse.json({ ok: true, rescored });
}
