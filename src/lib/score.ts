// Deterministic keyword-weight scoring. Same logic runs in the app (sorting the board)
// and in scripts/ingest.ts (nothing ingest-specific depends on it yet, but it must stay
// the one place scoring rules live — see CLAUDE.md).
export type KeywordWeights = Record<string, number>;

export function scoreJob(
  job: { title: string; company: string; location?: string | null },
  weights: KeywordWeights,
): number {
  const haystack = `${job.title} ${job.company} ${job.location ?? ""}`.toLowerCase();
  let score = 0;
  for (const [keyword, weight] of Object.entries(weights)) {
    if (haystack.includes(keyword.toLowerCase())) score += weight;
  }
  return score;
}
