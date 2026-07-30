import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./client";
import { jobs, trackedJobs, preferences } from "./schema";
import { scoreJob, type KeywordWeights } from "@/lib/score";

// Every function below takes userId first and filters on it — jobs is the one shared,
// non-user-scoped table (the board), touched only by upsertJobs from the ingest script.

export async function getPreferences(userId: string): Promise<KeywordWeights> {
  const [row] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  return (row?.keywordWeights as KeywordWeights) ?? {};
}

export async function setPreferences(userId: string, weights: KeywordWeights) {
  await db
    .insert(preferences)
    .values({ userId, keywordWeights: weights })
    .onConflictDoUpdate({ target: preferences.userId, set: { keywordWeights: weights } });
}

export async function getBoard(userId: string) {
  const weights = await getPreferences(userId);
  const rows = await db
    .select({ job: jobs, status: trackedJobs.status })
    .from(jobs)
    .leftJoin(trackedJobs, and(eq(trackedJobs.jobId, jobs.id), eq(trackedJobs.userId, userId)))
    .orderBy(desc(jobs.postedAt));

  return rows
    .map((r) => ({ ...r.job, status: r.status, score: scoreJob(r.job, weights) }))
    .sort((a, b) => b.score - a.score);
}

export async function getTrackedJobs(userId: string) {
  return db
    .select({ job: jobs, status: trackedJobs.status, notes: trackedJobs.notes })
    .from(trackedJobs)
    .innerJoin(jobs, eq(jobs.id, trackedJobs.jobId))
    .where(eq(trackedJobs.userId, userId));
}

export async function trackJob(userId: string, jobId: string, status: string, notes?: string) {
  await db
    .insert(trackedJobs)
    .values({ userId, jobId, status, notes })
    .onConflictDoUpdate({
      target: [trackedJobs.userId, trackedJobs.jobId],
      set: { status, notes, updatedAt: new Date() },
    });
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
