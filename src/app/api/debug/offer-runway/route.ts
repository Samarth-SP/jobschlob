import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { db } from "@/db/client";
import { jobs, jobMatches } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getFilters, getApplyTasks } from "@/db/queries";
import { DEFAULT_RETENTION_DAYS, EXTENDED_RETENTION_DAYS, isExtendedRetentionCompany } from "@/lib/company-tier";

export const runtime = "nodejs";

// Temporary diagnostic route (bearer-token authed) — not linked from any UI. Answers, without
// needing direct DB access: are offer-runway jobs actually inside the dashboard's retention
// window, is the autoApply filter actually saved, and are any apply tasks actually queued.
function withinRetention(postedAt: Date | null, company: string): boolean {
  if (!postedAt) return false;
  const days = isExtendedRetentionCompany(company) ? EXTENDED_RETENTION_DAYS : DEFAULT_RETENTION_DAYS;
  return postedAt.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export async function GET(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({ job: jobs, score: jobMatches.score, rationale: jobMatches.rationale })
    .from(jobs)
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(eq(jobs.source, "offer-runway"));

  const filters = await getFilters(userId);
  const tasks = await getApplyTasks(userId);

  return NextResponse.json({
    totalOfferRunwayJobs: rows.length,
    withinRetentionCount: rows.filter((r) => withinRetention(r.job.postedAt, r.job.company)).length,
    sample: rows.slice(0, 8).map((r) => ({
      title: r.job.title,
      company: r.job.company,
      postedAt: r.job.postedAt,
      score: r.score,
      rationale: r.rationale,
      withinRetention: withinRetention(r.job.postedAt, r.job.company),
    })),
    autoApplyFilter: filters.autoApply ?? null,
    applyTaskCount: tasks.length,
    applyTasks: tasks.map((t) => ({ status: t.task.status, jobTitle: t.job.title, company: t.job.company })),
  });
}
