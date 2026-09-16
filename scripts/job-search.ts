// Runs the LLM-powered personalized job search (src/lib/job-search.ts) for every profile that has
// it enabled and has configured their own Anthropic key — see .github/workflows/search.yml for the
// cron. Each profile runs on its own key, so one user's search never touches the app's shared
// ANTHROPIC_API_KEY (that's enforced in llm-client.ts's runWebSearchTool, not here).
import { getSearchEnabledProfiles } from "../src/db/queries";
import { runJobSearchForProfile } from "../src/lib/job-search";

async function main() {
  const profiles = await getSearchEnabledProfiles();
  if (!profiles.length) {
    console.log("no profiles have personalized search enabled");
    return;
  }

  // allSettled, not all — one user's bad/expired key or rate limit must not block everyone else's.
  const settled = await Promise.allSettled(profiles.map((p) => runJobSearchForProfile(p.userId)));
  settled.forEach((r, i) => {
    const userId = profiles[i].userId;
    if (r.status === "fulfilled") console.log(`${userId}: found ${r.value.found} job(s)`);
    else console.error(`${userId}: search failed: ${r.reason}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
