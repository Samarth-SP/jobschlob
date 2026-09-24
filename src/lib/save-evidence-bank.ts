// Shared by /api/profile/evidence/save (session-authed, browser upload flow) and
// /api/profile/evidence/push (bearer-token authed, for the local BoofSimplify worker) — same
// pattern as src/lib/import-offer-runway.ts. Full-replace, by design: whichever caller sends a
// bank, it becomes the whole stored bank. For the push path this is correct semantics (boof owns
// editing and pushes its current whole bank), not a limitation — see push route's own comment.
import { setEvidenceBank, getProfile, getJobsSince, saveJobMatches } from "@/db/queries";
import { assignEvidenceIds, type EvidenceBank } from "./evidence";
import { scoreJobForUser } from "./match";
import { EXTENDED_RETENTION_DAYS } from "./company-tier";

export async function saveEvidenceBankAndRescore(userId: string, bank: EvidenceBank): Promise<{ rescored: number }> {
  const saved = assignEvidenceIds(bank);
  await setEvidenceBank(userId, saved);

  // scoreJobForUser (lib/match.ts) prefers the evidence bank over plain background text when one's
  // present — without this, a freshly-saved bank leaves every existing jobMatches row stale until
  // ingest happens to re-touch a job (which, for an already-matched job, it never does; see
  // getMatchedJobIds), same reasoning the background-save action in app/profile/page.tsx follows.
  const background = await getProfile(userId);
  const cutoff = new Date(Date.now() - EXTENDED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const recentJobs = await getJobsSince(cutoff);
  const matches = recentJobs.flatMap((job) => {
    const result = scoreJobForUser(job, background, saved);
    return result ? [{ userId, jobId: job.id, ...result }] : [];
  });
  await saveJobMatches(matches);

  return { rescored: matches.length };
}
