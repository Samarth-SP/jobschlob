import { auth, signIn, signOut } from "@/lib/auth";
import { getBoard } from "@/db/queries";
import { TrackControls } from "@/components/TrackControls";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Sign in with GitHub
          </button>
        </form>
      </main>
    );
  }

  const board = await getBoard(session.user.email);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Board</h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button className="text-sm text-zinc-500 underline" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <ul className="flex flex-col gap-3">
        {board.map((job) => (
          <li key={job.id} className="flex items-center justify-between gap-4 rounded border p-3">
            <div>
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                {job.title}
              </a>
              <div className="text-sm text-zinc-500">
                {job.company} · {job.location ?? "remote/unspecified"} · score {job.score}
              </div>
            </div>
            <TrackControls jobId={job.id} status={job.status} />
          </li>
        ))}
        {board.length === 0 && <p className="text-zinc-500">No jobs yet — run the ingest script.</p>}
      </ul>
    </main>
  );
}
