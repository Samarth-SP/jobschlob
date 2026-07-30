import Link from "next/link";
import { auth } from "@/lib/auth";
import { getTrackedJobs, getProfile } from "@/db/queries";
import { WorkshopForm } from "@/components/WorkshopForm";

export default async function WorkshopPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to use the workshop.</main>;
  }
  const userId = session.user.email;
  const [tracked, background] = await Promise.all([getTrackedJobs(userId), getProfile(userId)]);

  if (!background.trim()) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
        <h1 className="text-xl font-semibold text-ink">Workshop</h1>
        <p className="text-ink-soft">
          Add your background on the{" "}
          <Link href="/profile" className="text-green underline">
            profile page
          </Link>{" "}
          first — the workshop scaffolds resumes and cover letters from it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold text-ink">Workshop</h1>
      <p className="text-sm text-ink-soft">
        Scaffolds your background into a LaTeX resume or cover letter, compiles it to a real PDF,
        and checks that the text extracts cleanly — the same way an ATS would read it.
      </p>
      <WorkshopForm jobs={tracked.map(({ job }) => ({ id: job.id, title: job.title, company: job.company }))} />
    </main>
  );
}
