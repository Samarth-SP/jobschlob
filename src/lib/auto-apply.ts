// Auto-queues a newly-scored job for the local BoofSimplify worker (see boof/remote.py) when it
// clears the user's own bar, instead of requiring a manual "Queue for auto-apply" click per job.
// Opt-in via profiles.filters.autoApply (see lib/dashboard-filters.ts) — disabled by default,
// since this changes what gets a real browser tab filled in on the user's machine.
import { getActiveDocument, getApplyTasks, getFilters, queueApplyTask } from "@/db/queries";
import { splitLocations, matchesArea } from "@/lib/locations";
import type { jobs } from "@/db/schema";

type Job = typeof jobs.$inferSelect;

// Same predicate NewJobsSection.tsx uses to filter the dashboard's "new jobs" list (minus
// `company`/`minScore`, handled separately below) — auto-apply is meant to feel like "queue
// anything that would show up in my filtered view, above a higher bar."
function matchesNarrowing(job: Job, filters: { locations?: string[]; areas?: string[]; company?: string; categories?: string[]; levels?: string[]; degreeLevels?: string[] }): boolean {
  const { locations = [], areas = [], company = "", categories = [], levels = [], degreeLevels = [] } = filters;
  if (locations.length || areas.length) {
    const cityMatch = locations.length > 0 && splitLocations(job.location).some((l) => locations.includes(l));
    const areaMatch = areas.length > 0 && areas.some((a) => matchesArea(job.location, a));
    if (!cityMatch && !areaMatch) return false;
  }
  if (company && !job.company.toLowerCase().includes(company.toLowerCase())) return false;
  if (categories.length && !(job.category && categories.includes(job.category))) return false;
  if (levels.length && !(job.level && levels.includes(job.level))) return false;
  if (degreeLevels.length && !(job.degreeLevel && degreeLevels.includes(job.degreeLevel))) return false;
  return true;
}

// Called right after saveJobMatches() for a freshly-scored batch (see scripts/import-careerops.ts).
// Returns how many tasks were actually queued.
export async function autoQueueMatches(userId: string, rows: { job: Job; score: number }[]): Promise<number> {
  if (rows.length === 0) return 0;

  const filters = await getFilters(userId);
  const rule = filters.autoApply;
  if (!rule?.enabled) return 0;

  const eligible = rows.filter((r) => r.score >= rule.minScore && matchesNarrowing(r.job, filters));
  if (eligible.length === 0) return 0;

  // queueApplyTask's upsert resets an existing task back to "queued" on conflict — that would
  // silently discard a filled/needs_input/error status the worker already reported. Only ever
  // auto-queue a job that has no apply-task row at all yet.
  const existing = await getApplyTasks(userId);
  const alreadyQueued = new Set(existing.map(({ job }) => job.id));
  const toQueue = eligible.filter((r) => !alreadyQueued.has(r.job.id));
  if (toQueue.length === 0) return 0;

  const activeResume = await getActiveDocument(userId, "resume");
  for (const { job } of toQueue) {
    await queueApplyTask(userId, job.id, activeResume?.id ?? null);
  }
  return toQueue.length;
}
