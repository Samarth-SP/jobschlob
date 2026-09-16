// One-time import of the 92 jobs already curated by the user's own external research routine
// ("Offer Runway"), captured directly from its artifact database — see PR/commit description for
// context. Run once via .github/workflows/backfill-jobs.yml (workflow_dispatch), then that
// workflow file can be deleted; this script is safe to re-run (upsertJobs is idempotent on id).
import { upsertJobs } from "../src/db/queries";
import data from "./data/offer-runway-jobs.json";

type RawRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  source: string;
  category: string;
  level: string | null;
  degreeLevel: string | null;
  postedAt: string | null;
};

async function main() {
  const rows = data as RawRow[];
  await upsertJobs(rows.map((r) => ({ ...r, postedAt: r.postedAt ? new Date(r.postedAt) : null })));
  console.log(`backfilled ${rows.length} jobs from offer-runway`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
