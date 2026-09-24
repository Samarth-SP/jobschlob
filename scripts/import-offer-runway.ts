// Repeatable import from "Offer Runway" — a live Claude Artifact (a self-contained page with its
// own shared database) that a daily search routine populates every morning with new listings. This
// is the successor to the one-time scripts/backfill-offer-runway.ts (which captured a September
// 2026 snapshot as scripts/data/offer-runway-jobs.json) — that script is safe to delete once this
// one has been run at least once, since upsertJobs/saveJobMatches are both idempotent.
//
// The artifact's database (a `listings` collection) isn't reachable from plain Node — it's read via
// Claude's ArtifactData tool, which only an agent session can call. So the actual pipeline is:
//   1. An agent (interactively, or a scheduled task) queries the artifact's `listings` collection
//      via ArtifactData and writes the raw documents to a JSON file.
//   2. That file is passed to this script with --data, which does the jobschlob-side work: map
//      fields, dedupe against the shared board by URL, score, and auto-queue.
//
// Run standalone via tsx, same as scripts/ingest.ts — needs DATABASE_URL exported the same way
// (`set -a; source .env; set +a`):
//   npx tsx scripts/import-offer-runway.ts --data /tmp/offer-runway-listings.json --user you@example.com [--dry-run]
//
// Input file shape: a JSON array, each element either a raw ArtifactData document
// ({id, data: {...}, version}) or already-unwrapped ({...}) — both are accepted, since that's
// exactly the shape an ArtifactData "query"/"list" result hands back document-by-document.
//
// Safe to re-run: upsertJobs/saveJobMatches are both idempotent (on `id` / on `(userId, jobId)`),
// and autoQueueMatches never re-queues a job that already has an apply-task row.
import { readFileSync } from "node:fs";
import { jobId as computeJobId } from "../src/lib/dedupe";
import { getJobByUrl, upsertJobs, saveJobMatches, getProfile } from "../src/db/queries";
import { scoreJobForUser } from "../src/lib/match";
import { autoQueueMatches } from "../src/lib/auto-apply";
import { jobs } from "../src/db/schema";

type JobRow = typeof jobs.$inferSelect;

type OfferRunwayDoc = {
  company?: string;
  role?: string;
  category?: string;
  location?: string;
  url?: string;
  status?: string; // new | interested | applied | interviewing | offer | closed
  addedAt?: string;
  posted?: string; // "YYYY-MM-DD", present on feed-sourced listings, absent on hand-added ones
};

function unwrap(raw: unknown): OfferRunwayDoc {
  if (raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)) {
    return (raw as { data: OfferRunwayDoc }).data ?? {};
  }
  return raw as OfferRunwayDoc;
}

function parseArgs(argv: string[]) {
  const out: { data?: string; user?: string; dryRun: boolean } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data") out.data = argv[++i];
    else if (argv[i] === "--user") out.user = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data || !args.user) {
    console.error("usage: import-offer-runway.ts --data <listings.json> --user <jobschlob user email> [--dry-run]");
    process.exit(1);
  }
  const userId = args.user;

  const raw = JSON.parse(readFileSync(args.data, "utf8"));
  if (!Array.isArray(raw)) {
    console.error(`${args.data} must contain a JSON array of listing documents`);
    process.exit(1);
  }
  const docs = raw.map(unwrap);

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
    // previous run of this script) — attach to that row instead of minting a duplicate.
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

  console.log(
    `parsed ${docs.length} doc(s): ${candidates.length} importable, ${skippedClosed} skipped (closed), ` +
      `${skippedIncomplete} skipped (missing company/role/url)`,
  );

  if (args.dryRun) {
    for (const c of candidates) console.log(`  [dry-run] ${c.company} — ${c.title} [${c.category ?? "uncategorized"}] ${c.url}`);
    return;
  }

  if (toInsert.length) await upsertJobs(toInsert);

  // No fit score comes from Offer Runway itself (it's a plain tracker, not an LLM evaluator) — score
  // exactly like any other newly-seen job, via the same keyword-overlap match scripts/ingest.ts uses.
  const background = await getProfile(userId);
  const matches = candidates
    .map((job) => {
      const result = scoreJobForUser(job, background);
      return result ? { job, score: result.score, rationale: result.rationale } : null;
    })
    .filter((m): m is { job: JobRow; score: number; rationale: string } => m !== null);

  await saveJobMatches(matches.map((m) => ({ userId, jobId: m.job.id, score: m.score, rationale: m.rationale })));
  const queued = await autoQueueMatches(userId, matches);

  console.log(`imported ${candidates.length} job(s), scored ${matches.length}, auto-queued ${queued} for boof`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
