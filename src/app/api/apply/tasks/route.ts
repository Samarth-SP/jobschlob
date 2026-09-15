import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queueApplyTask, getActiveDocument, getApplyTasks } from "@/db/queries";

export const runtime = "nodejs";

// Session-authenticated (unlike the rest of /api/apply/*) — this is the user clicking "Queue for
// auto-apply" in their own browser, not the local worker.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tasks = await getApplyTasks(session.user.email);
  return NextResponse.json({ tasks: tasks.map(({ task, job }) => ({ ...task, job })) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.email;

  const body = await req.json();
  const jobId = String(body.jobId ?? "");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  // Snapshotted at queue time (see queueApplyTask's comment) — the currently-active resume, if
  // any. Queuing without one is still allowed (the worker will just have nothing to upload; the
  // user can set an active resume and re-queue) rather than blocking the action outright.
  const activeResume = await getActiveDocument(userId, "resume");
  const task = await queueApplyTask(userId, jobId, activeResume?.id ?? null);
  return NextResponse.json({ task });
}
