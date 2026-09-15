import { eq, and, or, desc, sql, avg, count, inArray, notInArray, gte, lt, isNotNull } from "drizzle-orm";
import { db } from "./client";
import { jobs, trackedJobs, profiles, jobMatches, applicationEvents, documents } from "./schema";
import type { DashboardFilters } from "@/lib/dashboard-filters";
import type { LlmConfig } from "@/lib/llm-config";
import {
  DEFAULT_RETENTION_DAYS,
  EXTENDED_RETENTION_DAYS,
  EXTENDED_RETENTION_COMPANIES,
} from "@/lib/company-tier";

// Every function below takes userId first and filters on it — jobs is the one shared,
// non-user-scoped table (the board), touched only by upsertJobs from the ingest script.

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
const companyLower = sql`lower(${jobs.company})`;

// A job is "live" on the board while it's inside its retention window: EXTENDED_RETENTION_DAYS
// for the exclusivity-clause companies (see company-tier.ts), DEFAULT_RETENTION_DAYS for
// everyone else. Shared by getRankedBoard (what a user sees) and scripts/ingest.ts (what gets
// pruned) so the two windows can't drift.
export function withinRetentionWindow() {
  return or(
    and(inArray(companyLower, EXTENDED_RETENTION_COMPANIES), gte(jobs.postedAt, daysAgo(EXTENDED_RETENTION_DAYS))),
    and(notInArray(companyLower, EXTENDED_RETENTION_COMPANIES), gte(jobs.postedAt, daysAgo(DEFAULT_RETENTION_DAYS))),
  );
}

// Inverse, for pruning — written out rather than not(withinRetentionWindow()) so a NULL
// postedAt (a few legacy rows) matches neither branch and is never pruned, same as before.
export function pastRetentionWindow() {
  return or(
    and(inArray(companyLower, EXTENDED_RETENTION_COMPANIES), lt(jobs.postedAt, daysAgo(EXTENDED_RETENTION_DAYS))),
    and(notInArray(companyLower, EXTENDED_RETENTION_COMPANIES), lt(jobs.postedAt, daysAgo(DEFAULT_RETENTION_DAYS))),
  );
}

// New jobs sorted strictly by posting date first (day granularity — see the date_trunc below),
// keyword-match compatibility score (jobMatches, populated by scripts/ingest.ts) breaking ties
// within the same day. Deliberately postedAt (when the job was actually posted), not createdAt
// (when our ingest happened to first see it) — a source can surface a listing to us weeks after
// it went up (feed lag, a board we only just started tracking, a listing re-activating), and
// sorting/pruning by createdAt let those stale-by-real-world-date postings sort as if brand new.
// Confirmed against production data: a job actually posted 2.5 months earlier was sorting first
// because we'd only ingested it that day.
//
// A job tracked by ANY user is exempt from ingest's prune step (see scripts/ingest.ts), so the
// jobs table alone can hold postings well past the retention window. Without the window/tracked
// filter below, every other user would keep seeing that job as "new" indefinitely — it should
// only still be visible to the user who actually tracked it.
export async function getRankedBoard(userId: string) {
  const rows = await db
    .select({ job: jobs, status: trackedJobs.status, score: jobMatches.score, rationale: jobMatches.rationale })
    .from(jobs)
    .leftJoin(trackedJobs, and(eq(trackedJobs.jobId, jobs.id), eq(trackedJobs.userId, userId)))
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(or(withinRetentionWindow(), isNotNull(trackedJobs.status)))
    .orderBy(sql`date_trunc('day', ${jobs.postedAt}) DESC NULLS LAST`, sql`${jobMatches.score} DESC NULLS LAST`);

  return rows.map((r) => ({ ...r.job, status: r.status, score: r.score, rationale: r.rationale }));
}

// Everything ingested since `cutoff` — used by the profile page to force-rescore against
// whatever's currently live when the background changes, without waiting for the next ingest run.
export async function getJobsSince(cutoff: Date) {
  return db.select().from(jobs).where(gte(jobs.createdAt, cutoff));
}

export async function getJobById(id: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

export async function getTrackedJobs(userId: string) {
  return db
    .select({ job: jobs, status: trackedJobs.status, notes: trackedJobs.notes })
    .from(trackedJobs)
    .innerJoin(jobs, eq(jobs.id, trackedJobs.jobId))
    .where(eq(trackedJobs.userId, userId));
}

// Dashboard's "Recent Applications" — same as getTrackedJobs but with each job's full status
// history attached, for the expandable timeline. Reuses applicationEvents (already the source of
// truth for the analytics heatmap/Sankey) rather than adding a new table.
export async function getTrackedJobsWithHistory(userId: string) {
  const [rows, events] = await Promise.all([
    db
      .select({ job: jobs, status: trackedJobs.status, notes: trackedJobs.notes, updatedAt: trackedJobs.updatedAt })
      .from(trackedJobs)
      .innerJoin(jobs, eq(jobs.id, trackedJobs.jobId))
      .where(eq(trackedJobs.userId, userId))
      .orderBy(desc(trackedJobs.updatedAt)),
    db
      .select({ jobId: applicationEvents.jobId, status: applicationEvents.status, changedAt: applicationEvents.changedAt })
      .from(applicationEvents)
      .where(eq(applicationEvents.userId, userId))
      .orderBy(applicationEvents.changedAt),
  ]);

  const historyByJob = new Map<string, { status: string; changedAt: Date }[]>();
  for (const e of events) {
    const list = historyByJob.get(e.jobId);
    if (list) list.push({ status: e.status, changedAt: e.changedAt });
    else historyByJob.set(e.jobId, [{ status: e.status, changedAt: e.changedAt }]);
  }

  return rows.map((r) => ({ ...r, history: historyByJob.get(r.job.id) ?? [] }));
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
// Batched: the SimplifyJobs feeds alone push tens of thousands of rows, well past what a single
// insert can carry over Neon's HTTP driver in one request.
const UPSERT_BATCH_SIZE = 500;

export async function upsertJobs(rows: (typeof jobs.$inferInsert)[]) {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    await db
      .insert(jobs)
      .values(batch)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          location: sql`excluded.location`,
          url: sql`excluded.url`,
          category: sql`excluded.category`,
          level: sql`excluded.level`,
          degreeLevel: sql`excluded.degree_level`,
          postedAt: sql`excluded.posted_at`,
        },
      });
  }
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

export async function getFilters(userId: string): Promise<DashboardFilters> {
  const [row] = await db.select({ filters: profiles.filters }).from(profiles).where(eq(profiles.userId, userId));
  return (row?.filters as DashboardFilters) ?? {};
}

export async function setFilters(userId: string, filters: DashboardFilters) {
  await db
    .insert(profiles)
    .values({ userId, filters })
    .onConflictDoUpdate({ target: profiles.userId, set: { filters } });
}

// null means the user hasn't configured anything — every stored key is encrypted (lib/crypto.ts);
// this returns it as-is (still encrypted), decryption happens only in lib/llm-client.ts at the
// point of use, never here.
export async function getLlmConfig(userId: string): Promise<LlmConfig | null> {
  const [row] = await db.select({ llmConfig: profiles.llmConfig }).from(profiles).where(eq(profiles.userId, userId));
  return (row?.llmConfig as LlmConfig | null) ?? null;
}

export async function setLlmConfig(userId: string, llmConfig: LlmConfig) {
  await db
    .insert(profiles)
    .values({ userId, llmConfig })
    .onConflictDoUpdate({ target: profiles.userId, set: { llmConfig, updatedAt: new Date() } });
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

// Consecutive status-to-status transitions per job (e.g. applied -> interview), aggregated
// into edge counts for the Sankey chart. Computed in JS rather than SQL — the dataset is small
// (2 users) and a per-job ordered walk is simpler to get right than a self-join/window query.
export async function getStatusTransitions(userId: string): Promise<{ source: string; target: string; value: number }[]> {
  const events = await db
    .select({ jobId: applicationEvents.jobId, status: applicationEvents.status })
    .from(applicationEvents)
    .where(eq(applicationEvents.userId, userId))
    .orderBy(applicationEvents.jobId, applicationEvents.changedAt);

  const byJob = new Map<string, string[]>();
  for (const e of events) {
    const seq = byJob.get(e.jobId);
    if (seq) seq.push(e.status);
    else byJob.set(e.jobId, [e.status]);
  }

  const edgeCounts = new Map<string, number>();
  for (const seq of byJob.values()) {
    for (let i = 0; i < seq.length - 1; i++) {
      const key = `${seq[i]} ${seq[i + 1]}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  return [...edgeCounts.entries()].map(([key, value]) => {
    const [source, target] = key.split(" ");
    return { source, target, value };
  });
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

// "Active" is exclusive per (userId, kind) — marking one resume active unmarks any other resume
// (cover letters have their own independent active slot). Two sequential updates rather than a
// transaction: fine at this app's scale (2 users), and Neon's HTTP driver doesn't carry
// multi-statement transactions well.
export async function setActiveDocument(userId: string, id: number) {
  const [doc] = await db
    .select({ kind: documents.kind })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  if (!doc) return;
  await db.update(documents).set({ active: false }).where(and(eq(documents.userId, userId), eq(documents.kind, doc.kind)));
  await db.update(documents).set({ active: true }).where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

// Recompile/rescan write path — updates a document's stored latex/blobUrl/atsNotes in place
// after the user edits wording (recompile) or just re-runs the ATS check (rescan). Scoped to
// userId like deleteDocument, for the same reason.
export async function updateDocumentContent(
  userId: string,
  id: number,
  patch: Partial<Pick<typeof documents.$inferInsert, "latex" | "blobUrl" | "atsNotes">>,
) {
  const [updated] = await db
    .update(documents)
    .set(patch)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function getDocumentById(userId: string, id: number) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return doc ?? null;
}

// Scoped to userId so one user can't delete another's document by guessing an id.
export async function deleteDocument(userId: string, id: number) {
  const [deleted] = await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning();
  return deleted ?? null;
}
