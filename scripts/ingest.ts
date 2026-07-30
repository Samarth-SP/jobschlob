import { db } from "../src/db/client";
import { upsertJobs, getAllProfiles, getMatchedJobIds, saveJobMatches } from "../src/db/queries";
import { jobId } from "../src/lib/dedupe";
import { scoreJobForUser } from "../src/lib/match";
import { jobs, trackedJobs } from "../src/db/schema";
import { and, lt, notInArray } from "drizzle-orm";

// One hardcoded source to prove the pipeline end to end. Greenhouse's public job-board API
// needs no auth and no scraping (https://boards-api.greenhouse.io/v1/boards/{slug}/jobs).
// ponytail: single hardcoded source, add more sources/adapters when the board actually needs them.
const SOURCES = ["asana"];

type GreenhouseJob = {
  id: number;
  title: string;
  location: { name: string };
  absolute_url: string;
  updated_at: string;
};

async function fetchSource(slug: string) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!res.ok) throw new Error(`${slug}: ${res.status}`);
  const { jobs: listings }: { jobs: GreenhouseJob[] } = await res.json();

  return listings.map((j) => ({
    id: jobId(`greenhouse:${slug}`, j.id),
    title: j.title,
    company: slug,
    location: j.location?.name ?? null,
    url: j.absolute_url,
    source: `greenhouse:${slug}`,
    postedAt: new Date(j.updated_at),
  }));
}

async function main() {
  const rows = (await Promise.all(SOURCES.map(fetchSource))).flat();
  await upsertJobs(rows);
  console.log(`ingested ${rows.length} jobs from ${SOURCES.length} source(s)`);

  const profiles = await getAllProfiles();
  const jobIds = rows.map((r) => r.id);
  let scored = 0;
  for (const profile of profiles) {
    if (!profile.background.trim()) continue;
    const alreadyMatched = await getMatchedJobIds(profile.userId, jobIds);
    const toScore = rows.filter((r) => !alreadyMatched.has(r.id));
    const matches: { userId: string; jobId: string; score: number; rationale: string | null }[] = [];
    for (const job of toScore) {
      const result = await scoreJobForUser(job, profile.background);
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
