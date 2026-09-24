import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { db } from "@/db/client";
import { jobs, jobMatches } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getFilters, getApplyTasks, getRankedBoard } from "@/db/queries";
import { OFFER_RUNWAY_SOURCE } from "@/lib/company-tier";

export const runtime = "nodejs";

// Temporary diagnostic route (bearer-token authed) — not linked from any UI. Answers, without
// needing direct DB access: are offer-runway jobs actually visible on the dashboard right now
// (calls the SAME getRankedBoard() the dashboard itself uses — not a reimplementation, so this
// can't drift from the real behavior the way a hand-rolled retention check already once did),
// is the autoApply filter actually saved, and are any apply tasks actually queued.
export async function GET(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [allOfferRunway, board, filters, tasks] = await Promise.all([
    db
      .select({ job: jobs, score: jobMatches.score, rationale: jobMatches.rationale })
      .from(jobs)
      .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
      .where(eq(jobs.source, OFFER_RUNWAY_SOURCE)),
    getRankedBoard(userId),
    getFilters(userId),
    getApplyTasks(userId),
  ]);

  const visibleIds = new Set(board.map((b) => b.id));

  return NextResponse.json({
    totalOfferRunwayJobs: allOfferRunway.length,
    visibleOnDashboardCount: allOfferRunway.filter((r) => visibleIds.has(r.job.id)).length,
    sample: allOfferRunway.slice(0, 8).map((r) => ({
      title: r.job.title,
      company: r.job.company,
      postedAt: r.job.postedAt,
      score: r.score,
      rationale: r.rationale,
      visibleOnDashboard: visibleIds.has(r.job.id),
    })),
    autoApplyFilter: filters.autoApply ?? null,
    applyTaskCount: tasks.length,
    applyTasks: tasks.map((t) => ({ status: t.task.status, jobTitle: t.job.title, company: t.job.company })),
  });
}
