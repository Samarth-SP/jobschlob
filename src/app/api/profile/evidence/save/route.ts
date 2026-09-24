import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setEvidenceBank, getProfile, getJobsSince, saveJobMatches } from "@/db/queries";
import { assignEvidenceIds, type EvidenceBank } from "@/lib/evidence";
import { scoreJobForUser } from "@/lib/match";
import { EXTENDED_RETENTION_DAYS } from "@/lib/company-tier";

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

  const saved = assignEvidenceIds(bank);
  await setEvidenceBank(userId, saved);

  // scoreJobForUser (lib/match.ts) now prefers the evidence bank over plain background text when
  // one's present — without this, a freshly-saved bank leaves every existing jobMatches row stale
  // until ingest happens to re-touch a job (which, for an already-matched job, it never does; see
  // getMatchedJobIds), same reasoning the background-save action in app/profile/page.tsx already
  // follows.
  const background = await getProfile(userId);
  const cutoff = new Date(Date.now() - EXTENDED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const recentJobs = await getJobsSince(cutoff);
  const matches = recentJobs.flatMap((job) => {
    const result = scoreJobForUser(job, background, saved);
    return result ? [{ userId, jobId: job.id, ...result }] : [];
  });
  await saveJobMatches(matches);

  return NextResponse.json({ ok: true, rescored: matches.length });
}
