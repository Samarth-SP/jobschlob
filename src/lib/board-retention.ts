// Single source of truth for the board's retention window: scripts/ingest.ts prunes any job
// older than this that no user has tracked (trackedJobs rows are exempt, see queries.ts), and a
// profile revision (src/app/profile/page.tsx) rescopes to it too when force-rescoring. Kept in
// one place so ingest's prune cutoff and the profile rescore cutoff can't drift apart.
export const BOARD_RETENTION_DAYS = 7;
