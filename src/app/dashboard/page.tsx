import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRankedBoard, getTrackedJobs, getAvgMatchScore, getFilters } from "@/db/queries";
import { StatusEditor } from "@/components/StatusEditor";
import { NewJobsSection } from "@/components/NewJobsSection";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to see your dashboard.</main>;
  }
  const userId = session.user.email;

  const [board, tracked, avgMatch, filters] = await Promise.all([
    getRankedBoard(userId),
    getTrackedJobs(userId),
    getAvgMatchScore(userId),
    getFilters(userId),
  ]);

  const newJobs = board.filter((job) => !job.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
      <Link
        href="/analytics"
        className="flex items-center justify-between rounded border border-accent/20 bg-pop-tint px-4 py-3 transition-colors hover:border-pop"
      >
        <div>
          <div className="text-sm text-foreground-muted">Average match score</div>
          <div className="text-2xl font-semibold text-foreground">
            {avgMatch.overall !== null ? Math.round(avgMatch.overall) : "—"}
            <span className="text-sm font-normal text-foreground-muted"> / 100</span>
          </div>
        </div>
        <span className="text-sm text-pop">View analytics →</span>
      </Link>

      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-pop">New jobs</h1>
        <NewJobsSection jobs={newJobs} initialFilters={filters} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-pop">Tracked</h2>
        <ul className="flex flex-col gap-3">
          {tracked.map(({ job, status, notes }) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-4 rounded border border-accent/20 bg-surface p-3"
            >
              <div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {job.title}
                </a>
                <div className="text-sm text-foreground-muted">{job.company}</div>
                {notes && <div className="text-sm text-foreground-muted">{notes}</div>}
              </div>
              <StatusEditor jobId={job.id} status={status} />
            </li>
          ))}
          {tracked.length === 0 && <p className="text-foreground-muted">Nothing tracked yet.</p>}
        </ul>
      </section>
    </main>
  );
}
