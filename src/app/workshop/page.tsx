import Link from "next/link";
import { auth } from "@/lib/auth";
import { getTrackedJobs, getProfile, getDocuments, getEvidenceBank } from "@/db/queries";
import { WorkshopDashboard } from "@/components/WorkshopDashboard";
import { isEmptyEvidenceBank } from "@/lib/evidence";

export default async function WorkshopPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to use the workshop.</main>;
  }
  const userId = session.user.email;
  const [tracked, background, documents, evidenceBank] = await Promise.all([
    getTrackedJobs(userId),
    getProfile(userId),
    getDocuments(userId),
    getEvidenceBank(userId),
  ]);

  if (!background.trim() && isEmptyEvidenceBank(evidenceBank)) {
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

  const jobs = tracked.map(({ job }) => ({ id: job.id, title: job.title, company: job.company, category: job.category }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold text-pop">Workshop</h1>
      <p className="text-sm text-foreground-muted">
        Generate a resume or cover letter from your background, or bring your own — a .tex source
        is required so it can actually be workshopped here, a PDF alone can't be edited. Either
        way it lands in the library below: open any document to preview it, re-run the ATS check,
        and edit its wording in place, side by side with the rendered PDF.
      </p>
      <WorkshopDashboard initialDocuments={documents} jobs={jobs} />
    </main>
  );
}
