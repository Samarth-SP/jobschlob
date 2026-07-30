import { auth } from "@/lib/auth";
import { getTrackedJobs } from "@/db/queries";
import { TrackControls } from "@/components/TrackControls";

export default async function TrackedPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to see your tracked jobs.</main>;
  }

  const rows = await getTrackedJobs(session.user.email);
  const byStatus = Map.groupBy(rows, (r) => r.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <h1 className="text-xl font-semibold">Tracked</h1>
      {[...byStatus.entries()].map(([status, group]) => (
        <section key={status}>
          <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-500">{status}</h2>
          <ul className="flex flex-col gap-3">
            {group.map(({ job, notes }) => (
              <li key={job.id} className="flex items-center justify-between gap-4 rounded border p-3">
                <div>
                  <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {job.title}
                  </a>
                  <div className="text-sm text-zinc-500">{job.company}</div>
                  {notes && <div className="text-sm text-zinc-600">{notes}</div>}
                </div>
                <TrackControls jobId={job.id} status={status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {rows.length === 0 && <p className="text-zinc-500">Nothing tracked yet — track jobs from the board.</p>}
    </main>
  );
}
