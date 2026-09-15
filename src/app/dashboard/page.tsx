import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRankedBoard, getTrackedJobsWithHistory, getFilters, getProfile, getApplyTasks } from "@/db/queries";
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

  const [board, tracked, filters, background, applyTasks] = await Promise.all([
    getRankedBoard(userId),
    getTrackedJobsWithHistory(userId),
    getFilters(userId),
    getProfile(userId),
    getApplyTasks(userId),
  ]);

  const newJobs = board.filter((job) => !job.status);
  const applyStatusByJob = Object.fromEntries(
    applyTasks.map(({ task, job }) => [job.id, { status: task.status, notes: task.notes }]),
  );
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
            <TrackedApplications items={tracked} applyStatusByJob={applyStatusByJob} />
          </section>
        </div>
      </div>
    </main>
  );
}
