// Direct-DB import from "Offer Runway" (see src/lib/import-offer-runway.ts for the shared logic).
// Use this when you have DATABASE_URL locally. If you don't (e.g. this deployment's Neon DB isn't
// yours to connect to directly), use POST /api/jobs/import instead — same logic, authenticated
// with a jobschlob apply-api token instead of a raw DB connection.
//
// Run standalone via tsx, same as scripts/ingest.ts — needs DATABASE_URL exported the same way
// (`set -a; source .env; set +a`):
//   npx tsx scripts/import-offer-runway.ts --data /tmp/offer-runway-listings.json --user you@example.com [--dry-run]
//
// Input file: a JSON array from an ArtifactData query/list of the artifact's "listings" collection.
// Safe to re-run: upsertJobs/saveJobMatches are both idempotent, and autoQueueMatches never
// re-queues a job that already has an apply-task row.
import { readFileSync } from "node:fs";
import { importOfferRunwayListings, unwrapOfferRunwayDoc } from "../src/lib/import-offer-runway";

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

  const raw = JSON.parse(readFileSync(args.data, "utf8"));
  if (!Array.isArray(raw)) {
    console.error(`${args.data} must contain a JSON array of listing documents`);
    process.exit(1);
  }
  const docs = raw.map(unwrapOfferRunwayDoc);

  const result = await importOfferRunwayListings(args.user, docs, { dryRun: args.dryRun });
  console.log(
    `parsed ${result.parsed} doc(s): ${result.imported} importable, ${result.skippedClosed} skipped (closed), ` +
      `${result.skippedIncomplete} skipped (missing company/role/url)`,
  );
  if (result.dryRunPreview) {
    for (const line of result.dryRunPreview) console.log(`  [dry-run] ${line}`);
    return;
  }
  console.log(`imported ${result.imported} job(s), scored ${result.scored}, auto-queued ${result.queued} for boof`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
