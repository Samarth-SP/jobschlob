import { db } from "../src/db/client";
import { upsertJobs, getAllProfiles, getMatchedJobIds, saveJobMatches } from "../src/db/queries";
import { jobId } from "../src/lib/dedupe";
import { scoreJobForUser } from "../src/lib/match";
import { classifyLevel } from "../src/lib/level-heuristic";
import { jobs, trackedJobs } from "../src/db/schema";
import { and, lt, notInArray } from "drizzle-orm";

// Greenhouse's public job-board API (https://boards-api.greenhouse.io/v1/boards/{slug}/jobs)
// needs no auth and no scraping. Boards list every seniority mixed together, so each posting is
// run through classifyLevel() and dropped if it doesn't look entry-level.
// ponytail: slugs were confirmed live against each company's real careers page one at a time —
// a board 200ing is not proof it's the right company (boards-api.greenhouse.io/v1/boards/bcg
// resolves and returns real-looking jobs, but it is not Boston Consulting Group). Verify before
// adding another.
const GREENHOUSE_BOARDS: { slug: string; category: "tech" | "consulting" | "vc_pe" }[] = [
  { slug: "asana", category: "tech" },
  { slug: "alixpartners", category: "consulting" },
  { slug: "a16z", category: "vc_pe" },
  { slug: "generalcatalyst", category: "vc_pe" },
];

// SimplifyJobs' community-maintained feeds — hundreds of companies' internship/new-grad tech
// postings pre-aggregated into one JSON file, updated hourly. Level is implicit in which feed a
// listing came from, so (unlike Greenhouse) nothing here needs classifyLevel().
const SIMPLIFY_FEEDS: { url: string; level: "internship" | "new_grad" }[] = [
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    level: "internship",
  },
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    level: "new_grad",
  },
];

type GreenhouseJob = {
  id: number;
  title: string;
  location: { name: string };
  absolute_url: string;
  updated_at: string;
};

async function fetchGreenhouseBoard(board: (typeof GREENHOUSE_BOARDS)[number]) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`);
  if (!res.ok) throw new Error(`${board.slug}: ${res.status}`);
  const { jobs: listings }: { jobs: GreenhouseJob[] } = await res.json();

  return listings.flatMap((j) => {
    const level = classifyLevel(j.title);
    if (!level) return [];
    return [
      {
        id: jobId(`greenhouse:${board.slug}`, j.id),
        title: j.title,
        company: board.slug,
        location: j.location?.name ?? null,
        url: j.absolute_url,
        source: `greenhouse:${board.slug}`,
        category: board.category,
        level,
        postedAt: new Date(j.updated_at),
      },
    ];
  });
}

type SimplifyListing = {
  id: string;
  title: string;
  company_name: string;
  locations: string[];
  url: string;
  active: boolean;
  date_posted: number; // unix seconds
};

async function fetchSimplifyFeed(feed: (typeof SIMPLIFY_FEEDS)[number]) {
  const res = await fetch(feed.url);
  if (!res.ok) throw new Error(`simplify ${feed.level}: ${res.status}`);
  const listings: SimplifyListing[] = await res.json();

  return listings
    .filter((l) => l.active)
    .map((l) => ({
      id: jobId(`simplify:${feed.level}`, l.id),
      title: l.title,
      company: l.company_name,
      // "; " not ", " — each entry is already a "City, State" string, so a comma can't be used
      // to separate multiple locations without colliding with the comma inside each one.
      location: l.locations?.length ? l.locations.join("; ") : null,
      url: l.url,
      source: `simplify:${feed.level}`,
      category: "tech" as const,
      level: feed.level,
      postedAt: new Date(l.date_posted * 1000),
    }));
}

async function main() {
  const rows = (
    await Promise.all([...GREENHOUSE_BOARDS.map(fetchGreenhouseBoard), ...SIMPLIFY_FEEDS.map(fetchSimplifyFeed)])
  ).flat();
  await upsertJobs(rows);
  console.log(
    `ingested ${rows.length} entry-level jobs from ${GREENHOUSE_BOARDS.length} board(s) + ${SIMPLIFY_FEEDS.length} feed(s)`,
  );

  const profiles = await getAllProfiles();
  const jobIds = rows.map((r) => r.id);
  let scored = 0;
  for (const profile of profiles) {
    if (!profile.background.trim()) continue;
    const alreadyMatched = await getMatchedJobIds(profile.userId, jobIds);
    const toScore = rows.filter((r) => !alreadyMatched.has(r.id));
    const matches: { userId: string; jobId: string; score: number; rationale: string | null }[] = [];
    for (const job of toScore) {
      const result = scoreJobForUser(job, profile.background);
      if (result) matches.push({ userId: profile.userId, jobId: job.id, ...result });
    }
    await saveJobMatches(matches);
    scored += matches.length;
  }
  if (profiles.length) console.log(`scored ${scored} job matches across ${profiles.length} profile(s)`);

  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const tracked = await db.selectDistinct({ id: trackedJobs.jobId }).from(trackedJobs);
  const deleted = await db
    .delete(jobs)
    .where(and(lt(jobs.createdAt, cutoff), notInArray(jobs.id, tracked.length ? tracked.map((t) => t.id) : [""])))
    .returning({ id: jobs.id });
  if (deleted.length) console.log(`pruned ${deleted.length} jobs older than 60 days`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
