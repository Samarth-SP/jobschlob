import { db } from "../src/db/client";
import { upsertJobs, getAllProfiles, getMatchedJobIds, saveJobMatches } from "../src/db/queries";
import { jobId } from "../src/lib/dedupe";
import { scoreJobForUser } from "../src/lib/match";
import { classifyLevel } from "../src/lib/level-heuristic";
import { jobs, trackedJobs } from "../src/db/schema";
import { and, lt, notInArray } from "drizzle-orm";

type BoardCategory = "tech" | "consulting" | "vc_pe" | "robotics";

// Greenhouse's public job-board API (https://boards-api.greenhouse.io/v1/boards/{slug}/jobs)
// needs no auth and no scraping. Boards list every seniority mixed together, so each posting is
// run through classifyLevel() and dropped if it doesn't look entry-level.
// ponytail: slugs were confirmed live against each company's real careers page one at a time —
// a board 200ing is not proof it's the right company (boards-api.greenhouse.io/v1/boards/bcg
// resolves and returns real-looking jobs, but it is not Boston Consulting Group). Verify before
// adding another.
const GREENHOUSE_BOARDS: { slug: string; category: BoardCategory }[] = [
  { slug: "asana", category: "tech" },
  { slug: "alixpartners", category: "consulting" },
  { slug: "a16z", category: "vc_pe" },
  { slug: "generalcatalyst", category: "vc_pe" },
];

// Same verify-before-adding rule as GREENHOUSE_BOARDS above — a 200 isn't proof of identity.
const ROBOTICS_GREENHOUSE: { slug: string; category: BoardCategory }[] = [
  { slug: "figureai", category: "robotics" },
  { slug: "skildai-careers", category: "robotics" },
  { slug: "apptronik", category: "robotics" },
  { slug: "agilityrobotics", category: "robotics" },
  { slug: "pathrobotics", category: "robotics" },
  { slug: "diligentrobotics", category: "robotics" },
];

// Lever's public API (https://api.lever.co/v0/postings/{slug}?mode=json) needs no auth. Same
// verify-before-adding rule as Greenhouse — each slug below was checked live (job-board page
// title matches the company, listings' titles/locations are plausible) before landing here.
const LEVER_BOARDS: { slug: string; category: BoardCategory }[] = [
  { slug: "waabi", category: "robotics" },
  { slug: "shieldai", category: "robotics" },
  { slug: "brightmachines", category: "robotics" },
  { slug: "dexterity", category: "robotics" },
  { slug: "osaro", category: "robotics" },
  { slug: "robust-ai", category: "robotics" },
];

// Ashby's public job-board API (https://api.ashbyhq.com/posting-api/job-board/{slug}) needs no
// auth. Robotics-heavy roster since that's the vertical currently thin on Greenhouse/Lever.
const ROBOTICS_ASHBY: { slug: string; category: BoardCategory }[] = [
  { slug: "physicalintelligence", category: "robotics" },
  { slug: "gecko-robotics", category: "robotics" },
  { slug: "reliable-robotics", category: "robotics" },
  { slug: "serverobotics", category: "robotics" },
  { slug: "standardbots", category: "robotics" },
  { slug: "dexmate", category: "robotics" },
  { slug: "cosmic-robotics", category: "robotics" },
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

type LeverPosting = {
  id: string;
  text: string;
  categories: { location?: string };
  hostedUrl: string;
  createdAt: number; // unix ms
};

// Lever's public postings API — same no-auth, no-scraping shape as Greenhouse. Boards mix every
// seniority together too, so postings run through classifyLevel() the same way.
async function fetchLeverBoard(board: (typeof LEVER_BOARDS)[number]) {
  const res = await fetch(`https://api.lever.co/v0/postings/${board.slug}?mode=json`);
  if (!res.ok) throw new Error(`${board.slug}: ${res.status}`);
  const listings: LeverPosting[] = await res.json();

  return listings.flatMap((j) => {
    const level = classifyLevel(j.text);
    if (!level) return [];
    return [
      {
        id: jobId(`lever:${board.slug}`, j.id),
        title: j.text,
        company: board.slug,
        location: j.categories?.location ?? null,
        url: j.hostedUrl,
        source: `lever:${board.slug}`,
        category: board.category,
        level,
        postedAt: new Date(j.createdAt),
      },
    ];
  });
}

type AshbyJob = {
  id: string;
  title: string;
  location: string;
  jobUrl: string;
  publishedAt: string;
  isListed: boolean;
};

// Ashby's public job-board API — same no-auth shape. `isListed: false` means the posting is
// closed/hidden but still present in the response, so it's filtered out before classifyLevel().
async function fetchAshbyBoard(board: (typeof LEVER_BOARDS)[number]) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}`);
  if (!res.ok) throw new Error(`${board.slug}: ${res.status}`);
  const { jobs: listings }: { jobs: AshbyJob[] } = await res.json();

  return listings.flatMap((j) => {
    if (!j.isListed) return [];
    const level = classifyLevel(j.title);
    if (!level) return [];
    return [
      {
        id: jobId(`ashby:${board.slug}`, j.id),
        title: j.title,
        company: board.slug,
        location: j.location ?? null,
        url: j.jobUrl,
        source: `ashby:${board.slug}`,
        category: board.category,
        level,
        postedAt: new Date(j.publishedAt),
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

type IngestRow = typeof jobs.$inferInsert;

// A SimplifyJobs listing and a direct-ATS listing can describe the same posting (Simplify
// aggregates from the same boards we hit directly). When both show up, the direct-ATS row wins —
// it's the primary source, fresher and not dependent on Simplify's scrape cadence. Grouped by
// normalized (company, title, location) since the two sources mint different ids for the same job.
function dedupeAcrossSources(rows: IngestRow[]): IngestRow[] {
  const groups = new Map<string, IngestRow[]>();
  for (const row of rows) {
    const key = [row.company, row.title, row.location ?? ""].map((s) => s.trim().toLowerCase()).join("|");
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const result: IngestRow[] = [];
  let dropped = 0;
  for (const group of groups.values()) {
    const direct = group.filter((r) => !r.source.startsWith("simplify:"));
    if (direct.length && direct.length < group.length) {
      dropped += group.length - direct.length;
      result.push(...direct);
    } else {
      result.push(...group);
    }
  }
  if (dropped) console.log(`dropped ${dropped} simplify duplicate(s) already covered by a direct ATS source`);
  return result;
}

async function main() {
  const fetched = (
    await Promise.all([
      ...GREENHOUSE_BOARDS.map(fetchGreenhouseBoard),
      ...ROBOTICS_GREENHOUSE.map(fetchGreenhouseBoard),
      ...LEVER_BOARDS.map(fetchLeverBoard),
      ...ROBOTICS_ASHBY.map(fetchAshbyBoard),
      ...SIMPLIFY_FEEDS.map(fetchSimplifyFeed),
    ])
  ).flat();
  const rows = dedupeAcrossSources(fetched);
  await upsertJobs(rows);
  console.log(
    `ingested ${rows.length} entry-level jobs from ${GREENHOUSE_BOARDS.length + ROBOTICS_GREENHOUSE.length} greenhouse board(s), ${LEVER_BOARDS.length} lever board(s), ${ROBOTICS_ASHBY.length} ashby board(s) + ${SIMPLIFY_FEEDS.length} simplify feed(s)`,
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
