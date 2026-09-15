import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { updateApplyTaskStatus } from "@/db/queries";

export const runtime = "nodejs";

const VALID_STATUSES = new Set(["filled", "needs_input", "error"]);

// The local worker calls this once it's done with a task — after filling what it can (never
// submitting; see boof/apply/filler.py's is_submit_like() gate, unchanged by this integration).
export async function POST(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const taskId = Number(body.taskId);
  const status = String(body.status ?? "");
  if (!Number.isFinite(taskId) || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid taskId or status" }, { status: 400 });
  }

  const updated = await updateApplyTaskStatus(userId, taskId, {
    status: status as "filled" | "needs_input" | "error",
    notes: typeof body.notes === "string" ? body.notes.slice(0, 4000) : undefined,
    fieldFlags: body.fieldFlags,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
