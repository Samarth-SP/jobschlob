import { eq, and, desc, sql, avg, count, inArray } from "drizzle-orm";
import { db } from "./client";
import { jobs, trackedJobs, profiles, jobMatches, applicationEvents, documents } from "./schema";

// Every function below takes userId first and filters on it — jobs is the one shared,
// non-user-scoped table (the board), touched only by upsertJobs from the ingest script.

// New jobs ranked by LLM compatibility score (jobMatches, populated by scripts/ingest.ts).
// Unscored jobs (not yet matched, or the user has no profile) sort after scored ones by
// createdAt, so this doesn't depend on ingest's match-scoring pass having run yet.
export async function getRankedBoard(userId: string) {
  const rows = await db
    .select({ job: jobs, status: trackedJobs.status, score: jobMatches.score })
    .from(jobs)
    .leftJoin(trackedJobs, and(eq(trackedJobs.jobId, jobs.id), eq(trackedJobs.userId, userId)))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .orderBy(sql`${jobMatches.score} DESC NULLS LAST`, desc(jobs.createdAt));

  return rows.map((r) => ({ ...r.job, status: r.status, score: r.score }));
}

export async function getTrackedJobs(userId: string) {
  return db
    .select({ job: jobs, status: trackedJobs.status, notes: trackedJobs.notes })
    .from(trackedJobs)
    .innerJoin(jobs, eq(jobs.id, trackedJobs.jobId))
    .where(eq(trackedJobs.userId, userId));
}

// The single choke point for tracked-job status changes — every caller gets status-history
// logging for free. Only logs an event when the status actually changed (including the very
// first insert), so a notes-only edit or a duplicate call doesn't pollute the analytics
// heatmap/funnel with phantom entries.
export async function trackJob(userId: string, jobId: string, status: string, notes?: string) {
  const [existing] = await db
    .select({ status: trackedJobs.status })
    .from(trackedJobs)
    .where(and(eq(trackedJobs.userId, userId), eq(trackedJobs.jobId, jobId)));

  await db
    .insert(trackedJobs)
    .values({ userId, jobId, status, notes })
    .onConflictDoUpdate({
      target: [trackedJobs.userId, trackedJobs.jobId],
      set: { status, notes, updatedAt: new Date() },
    });

  if (!existing || existing.status !== status) {
    await db.insert(applicationEvents).values({ userId, jobId, status });
  }
}

export async function untrackJob(userId: string, jobId: string) {
  await db
    .delete(trackedJobs)
    .where(and(eq(trackedJobs.userId, userId), eq(trackedJobs.jobId, jobId)));
}

// Ingest-only — jobs is the shared board, not per-user, so no userId here.
export async function upsertJobs(rows: (typeof jobs.$inferInsert)[]) {
  if (rows.length === 0) return;
  await db
    .insert(jobs)
    .values(rows)
    .onConflictDoUpdate({
      target: jobs.id,
      set: {
        title: sql`excluded.title`,
        company: sql`excluded.company`,
        location: sql`excluded.location`,
        url: sql`excluded.url`,
        postedAt: sql`excluded.posted_at`,
      },
    });
}

export async function getProfile(userId: string): Promise<string> {
  const [row] = await db.select({ background: profiles.background }).from(profiles).where(eq(profiles.userId, userId));
  return row?.background ?? "";
}

export async function setProfile(userId: string, background: string) {
  await db
    .insert(profiles)
    .values({ userId, background })
    .onConflictDoUpdate({ target: profiles.userId, set: { background, updatedAt: new Date() } });
}

// Ingest-only — populates jobMatches for a batch of newly-seen jobs against one user.
export async function saveJobMatches(
  rows: { userId: string; jobId: string; score: number; rationale: string | null }[],
) {
  if (rows.length === 0) return;
  await db
    .insert(jobMatches)
    .values(rows)
    .onConflictDoUpdate({
      target: [jobMatches.userId, jobMatches.jobId],
      set: { score: sql`excluded.score`, rationale: sql`excluded.rationale`, computedAt: new Date() },
    });
}

export async function getJobMatches(userId: string) {
  return db.select().from(jobMatches).where(eq(jobMatches.userId, userId));
}

// Ingest-only — every user with a background set, to score newly-seen jobs against.
export async function getAllProfiles() {
  return db.select().from(profiles);
}

// Ingest-only — which of these jobIds already have a match for this user, so a fresh
// upsert of an already-scored job doesn't trigger a redundant (and billed) LLM call.
export async function getMatchedJobIds(userId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db
    .select({ jobId: jobMatches.jobId })
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), inArray(jobMatches.jobId, jobIds)));
  return new Set(rows.map((r) => r.jobId));
}

export async function getApplicationEvents(userId: string) {
  return db
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.userId, userId))
    .orderBy(applicationEvents.changedAt);
}

export async function getApplicationEventsByDay(userId: string) {
  return db
    .select({
      day: sql<string>`date(${applicationEvents.changedAt})`.as("day"),
      count: count(),
    })
    .from(applicationEvents)
    .where(and(eq(applicationEvents.userId, userId), eq(applicationEvents.status, "applied")))
    .groupBy(sql`date(${applicationEvents.changedAt})`);
}

// Per-status count of distinct jobs that ever reached that status. Callers pick the funnel
// order/subset to display — this just returns the raw grouped counts.
export async function getFunnelCounts(userId: string) {
  return db
    .select({ status: applicationEvents.status, jobCount: sql<number>`count(distinct ${applicationEvents.jobId})` })
    .from(applicationEvents)
    .where(eq(applicationEvents.userId, userId))
    .groupBy(applicationEvents.status);
}

export async function getAvgMatchScore(userId: string): Promise<{ overall: number | null; applied: number | null }> {
  const [overallRow] = await db
    .select({ avg: avg(jobMatches.score) })
    .from(jobMatches)
    .where(eq(jobMatches.userId, userId));

  const appliedJobIds = db
    .select({ jobId: trackedJobs.jobId })
    .from(trackedJobs)
    .where(and(eq(trackedJobs.userId, userId), sql`${trackedJobs.status} != 'interested'`));

  const [appliedRow] = await db
    .select({ avg: avg(jobMatches.score) })
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), inArray(jobMatches.jobId, appliedJobIds)));

  return {
    overall: overallRow?.avg ? Number(overallRow.avg) : null,
    applied: appliedRow?.avg ? Number(appliedRow.avg) : null,
  };
}

export async function getDocuments(userId: string, jobId?: string) {
  const conditions = jobId
    ? and(eq(documents.userId, userId), eq(documents.jobId, jobId))
    : eq(documents.userId, userId);
  return db.select().from(documents).where(conditions).orderBy(desc(documents.createdAt));
}

export async function saveDocument(row: typeof documents.$inferInsert) {
  const [saved] = await db.insert(documents).values(row).returning();
  return saved;
}
