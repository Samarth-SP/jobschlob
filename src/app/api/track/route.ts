import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trackJob, untrackJob } from "@/db/queries";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const userId = session.user.email;

  if (body.remove) {
    await untrackJob(userId, body.jobId);
  } else {
    await trackJob(userId, body.jobId, body.status, body.notes);
  }

  return NextResponse.json({ ok: true });
}
