import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRankedBoard, getTrackedJobs, getAvgMatchScore } from "@/db/queries";
import { StatusEditor } from "@/components/StatusEditor";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to see your dashboard.</main>;
  }
  const userId = session.user.email;

  const [board, tracked, avgMatch] = await Promise.all([
    getRankedBoard(userId),
    getTrackedJobs(userId),
    getAvgMatchScore(userId),
  ]);

  const newJobs = board.filter((job) => !job.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
      <Link
        href="/analytics"
        className="flex items-center justify-between rounded border border-ink-soft/20 bg-green-tint px-4 py-3 transition-colors hover:border-green"
      >
        <div>
          <div className="text-sm text-ink-soft">Average match score</div>
          <div className="text-2xl font-semibold text-ink">
            {avgMatch.overall !== null ? Math.round(avgMatch.overall) : "—"}
            <span className="text-sm font-normal text-ink-soft"> / 100</span>
          </div>
        </div>
        <span className="text-sm text-green">View analytics →</span>
      </Link>

      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink">New jobs</h1>
        <ul className="flex flex-col gap-3">
          {newJobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-4 rounded border border-ink-soft/20 bg-cream-dim p-3"
            >
              <div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink hover:underline"
                >
                  {job.title}
                </a>
                <div className="text-sm text-ink-soft">
                  {job.company} · {job.location ?? "remote/unspecified"}
                  {job.score !== null && <> · match {job.score}</>}
                </div>
              </div>
              <StatusEditor jobId={job.id} status={job.status} />
            </li>
          ))}
          {newJobs.length === 0 && <p className="text-ink-soft">No new jobs — run the ingest script.</p>}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Tracked</h2>
        <ul className="flex flex-col gap-3">
          {tracked.map(({ job, status, notes }) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-4 rounded border border-ink-soft/20 bg-cream-dim p-3"
            >
              <div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink hover:underline"
                >
                  {job.title}
                </a>
                <div className="text-sm text-ink-soft">{job.company}</div>
                {notes && <div className="text-sm text-ink-soft">{notes}</div>}
              </div>
              <StatusEditor jobId={job.id} status={status} />
            </li>
          ))}
          {tracked.length === 0 && <p className="text-ink-soft">Nothing tracked yet.</p>}
        </ul>
      </section>
    </main>
  );
}
