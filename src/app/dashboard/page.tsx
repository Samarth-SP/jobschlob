import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRankedBoard, getTrackedJobsWithHistory, getAvgMatchScore, getFilters, getProfile } from "@/db/queries";
import { NewJobsSection } from "@/components/NewJobsSection";
import { ProfileCard } from "@/components/ProfileCard";
import { StatTiles } from "@/components/StatTiles";
import { TrackedApplications } from "@/components/TrackedApplications";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to see your dashboard.</main>;
  }
  const userId = session.user.email;

  const [board, tracked, avgMatch, filters, background] = await Promise.all([
    getRankedBoard(userId),
    getTrackedJobsWithHistory(userId),
    getAvgMatchScore(userId),
    getFilters(userId),
    getProfile(userId),
  ]);

  const newJobs = board.filter((job) => !job.status);
  const greetingName = userId.split("@")[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-foreground-muted/70">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl font-semibold text-pop">Welcome back, {greetingName}.</h1>
        </div>
        <Link href="/analytics" className="shrink-0 text-sm text-pop hover:underline">
          View analytics →
        </Link>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProfileCard email={userId} background={background} />
          <StatTiles tracked={tracked} />
          {avgMatch.overall !== null && (
            <div className="rounded-xl border border-accent/15 bg-pop-tint p-4">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-foreground-muted/70">
                Avg match score
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {Math.round(avgMatch.overall)}
                <span className="text-sm font-normal text-foreground-muted"> / 100</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-pop">New jobs</h2>
            <NewJobsSection jobs={newJobs} initialFilters={filters} />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-pop">Recent applications</h2>
              <span className="text-sm text-foreground-muted">{tracked.length} total</span>
            </div>
            <TrackedApplications items={tracked} />
          </section>
        </div>
      </div>
    </main>
  );
}
