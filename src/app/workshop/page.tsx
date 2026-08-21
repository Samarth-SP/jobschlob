import Link from "next/link";
import { auth } from "@/lib/auth";
import { getTrackedJobs, getProfile, getDocuments } from "@/db/queries";
import { WorkshopDashboard } from "@/components/WorkshopDashboard";

export default async function WorkshopPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to use the workshop.</main>;
  }
  const userId = session.user.email;
  const [tracked, background, documents] = await Promise.all([
    getTrackedJobs(userId),
    getProfile(userId),
    getDocuments(userId),
  ]);

  if (!background.trim()) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
        <h1 className="text-xl font-semibold text-pop">Workshop</h1>
        <p className="text-foreground-muted">
          Add your background on the{" "}
          <Link href="/profile" className="text-accent underline">
            profile page
          </Link>{" "}
          first — the workshop scaffolds resumes and cover letters from it.
        </p>
      </main>
    );
  }

  const jobs = tracked.map(({ job }) => ({ id: job.id, title: job.title, company: job.company }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold text-pop">Workshop</h1>
      <p className="text-sm text-foreground-muted">
        Generate a resume or cover letter from your background, or upload one you already tailored
        elsewhere — either way it lands in the library below. Open any document to preview it,
        re-run the ATS check, and edit its wording in place.
      </p>
      <WorkshopDashboard initialDocuments={documents} jobs={jobs} />
    </main>
  );
}
