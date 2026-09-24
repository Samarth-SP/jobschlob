// Core of importing "Offer Runway" listings (a live Claude Artifact a daily search populates)
// into the shared jobs board — shared between scripts/import-offer-runway.ts (direct-DB path, for
// a machine with DATABASE_URL) and POST /api/jobs/import (bearer-token path, for a machine that
// only has a jobschlob apply-api token — see that route's comment for why both exist).
//
// No fit score comes from Offer Runway itself (it's a plain tracker, not an LLM evaluator) — score
// exactly like any other newly-seen job, via the same keyword-overlap match scripts/ingest.ts uses.
import { jobId as computeJobId } from "./dedupe";
import { getJobByUrl, upsertJobs, saveJobMatches, getProfile, getEvidenceBank } from "@/db/queries";
import { scoreJobForUser } from "./match";
import { autoQueueMatches } from "./auto-apply";
import { jobs } from "@/db/schema";

// The later of the two dates a listing carries: its original posting date (which can be weeks
// old for something Offer Runway curated a while ago but is still tracking) and when it was added
// to the tracker. getRankedBoard()'s retention window is keyed on postedAt, so using the original
// posting date alone would make a freshly-surfaced-but-originally-old listing invisible on the
// dashboard (and eventually prunable by the cron ingest) even though it's actively being tracked —
// same "a source can re-confirm a still-open listing" reasoning scripts/ingest.ts already applies
// to the SimplifyJobs feeds (postedAt = max(date_posted, date_updated)).
function laterOf(...dates: (string | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (Number.isNaN(t)) continue;
    if (!best || t > best.getTime()) best = new Date(t);
  }
  return best;
}

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

    // Same URL already on the board. If some OTHER source owns it (the cron ingest independently
    // found the same posting), attach our score to that row rather than overwriting its fields
    // with our (likely less precise) title/company/category. If WE created it on a previous run
    // of this same import, it's safe (and necessary — see laterOf's comment) to refresh it: the
    // upsert below lands on the same id either way, since it's a deterministic hash of source+url.
    const existing = await getJobByUrl(doc.url);
    if (existing && existing.source !== source) {
      candidates.push(existing);
      continue;
    }

    const postedAt = laterOf(doc.posted, doc.addedAt, existing?.postedAt?.toISOString());
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

  const [background, evidenceBank] = await Promise.all([getProfile(userId), getEvidenceBank(userId)]);
  const matches = candidates
    .map((job) => {
      const result = scoreJobForUser(job, background, evidenceBank);
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
