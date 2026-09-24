// Core of importing "Offer Runway" listings (a live Claude Artifact a daily search populates)
// into the shared jobs board — shared between scripts/import-offer-runway.ts (direct-DB path, for
// a machine with DATABASE_URL) and POST /api/jobs/import (bearer-token path, for a machine that
// only has a jobschlob apply-api token — see that route's comment for why both exist).
//
// No fit score comes from Offer Runway itself (it's a plain tracker, not an LLM evaluator) — score
// exactly like any other newly-seen job, via the same keyword-overlap match scripts/ingest.ts uses.
import { jobId as computeJobId } from "./dedupe";
import { getJobByUrl, upsertJobs, saveJobMatches, getProfile } from "@/db/queries";
import { scoreJobForUser } from "./match";
import { autoQueueMatches } from "./auto-apply";
import { jobs } from "@/db/schema";

type JobRow = typeof jobs.$inferSelect;

export type OfferRunwayDoc = {
  company?: string;
  role?: string;
  category?: string;
  location?: string;
  url?: string;
  status?: string; // new | interested | applied | interviewing | offer | closed
  addedAt?: string;
  posted?: string; // "YYYY-MM-DD", present on feed-sourced listings, absent on hand-added ones
};

// Accepts either a raw ArtifactData document ({id, data: {...}, version}) or an already-unwrapped
// object — both are accepted, since that's exactly the shape an ArtifactData "query"/"list" result
// hands back document-by-document.
export function unwrapOfferRunwayDoc(raw: unknown): OfferRunwayDoc {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    return (raw as { data: OfferRunwayDoc }).data ?? {};
  }
  return raw as OfferRunwayDoc;
}

export type ImportResult = {
  parsed: number;
  imported: number;
  scored: number;
  queued: number;
  skippedClosed: number;
  skippedIncomplete: number;
};

export async function importOfferRunwayListings(
  userId: string,
  docs: OfferRunwayDoc[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ImportResult & { dryRunPreview?: string[] }> {
  const source = "offer-runway";
  const toInsert: (typeof jobs.$inferInsert)[] = [];
  const candidates: JobRow[] = [];
  let skippedClosed = 0;
  let skippedIncomplete = 0;

  for (const doc of docs) {
    if ((doc.status ?? "new") === "closed") {
      skippedClosed++;
      continue;
    }
    if (!doc.company || !doc.role || !doc.url) {
      skippedIncomplete++;
      continue;
    }

    // Same URL already on the board (this exact posting also came in via the cron ingest, or a
    // previous run of this import) — attach to that row instead of minting a duplicate.
    const existing = await getJobByUrl(doc.url);
    if (existing) {
      candidates.push(existing);
      continue;
    }

    const dateStr = doc.posted ?? doc.addedAt;
    const postedAt = dateStr && !Number.isNaN(Date.parse(dateStr)) ? new Date(dateStr) : null;
    const id = computeJobId(source, doc.url);
    const row = {
      id,
      title: doc.role,
      company: doc.company,
      location: doc.location ?? null,
      url: doc.url,
      source,
      category: doc.category ?? null,
      level: null,
      degreeLevel: null,
      postedAt,
    };
    toInsert.push(row);
    // Not a full JobRow (no createdAt) — fine, everything downstream only reads the fields set above.
    candidates.push(row as JobRow);
  }

  if (dryRun) {
    return {
      parsed: docs.length, imported: candidates.length, scored: 0, queued: 0,
      skippedClosed, skippedIncomplete,
      dryRunPreview: candidates.map((c) => `${c.company} — ${c.title} [${c.category ?? "uncategorized"}] ${c.url}`),
    };
  }

  if (toInsert.length) await upsertJobs(toInsert);

  const background = await getProfile(userId);
  const matches = candidates
    .map((job) => {
      const result = scoreJobForUser(job, background);
      return result ? { job, score: result.score, rationale: result.rationale } : null;
    })
    .filter((m): m is { job: JobRow; score: number; rationale: string } => m !== null);

  await saveJobMatches(matches.map((m) => ({ userId, jobId: m.job.id, score: m.score, rationale: m.rationale })));
  const queued = await autoQueueMatches(userId, matches);

  return {
    parsed: docs.length, imported: candidates.length, scored: matches.length, queued,
    skippedClosed, skippedIncomplete,
  };
}
