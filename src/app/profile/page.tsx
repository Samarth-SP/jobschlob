import { auth } from "@/lib/auth";
import { getProfile, setProfile, getJobsSince, saveJobMatches } from "@/db/queries";
import { scoreJobForUser } from "@/lib/match";
import { BOARD_RETENTION_DAYS } from "@/lib/board-retention";
import { revalidatePath } from "next/cache";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to edit your profile.</main>;
  }
  const userId = session.user.email;
  const background = await getProfile(userId);

  async function save(formData: FormData) {
    "use server";
    const background = String(formData.get("background") ?? "");
    await setProfile(userId, background);
    revalidatePath("/profile");

    // Force re-matching against everything currently on the board — otherwise a rewritten
    // background leaves every existing jobMatches row stale until ingest happens to re-touch
    // that job (which, for an already-seen job, it never does; see getMatchedJobIds). jobMatches
    // is keyed (userId, jobId), so this is a plain upsert, not a delete-then-reinsert.
    if (!background.trim()) return;
    const cutoff = new Date(Date.now() - BOARD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const recentJobs = await getJobsSince(cutoff);
    const matches = recentJobs.flatMap((job) => {
      const result = scoreJobForUser(job, background);
      return result ? [{ userId, jobId: job.id, ...result }] : [];
    });
    await saveJobMatches(matches);
    revalidatePath("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold text-pop">Profile</h1>
      <p className="text-sm text-foreground-muted">
        Write your background in plain text — experience, skills, what you&apos;re looking for.
        This is what job compatibility is scored against, and what the workshop scaffolds into
        resumes and cover letters.
      </p>
      <form action={save} className="flex flex-col gap-3">
        <textarea
          name="background"
          defaultValue={background}
          rows={20}
          className="rounded border border-accent/30 bg-surface p-3 text-sm text-foreground"
          placeholder="Software engineer with 5 years building backend systems in Go and Python..."
        />
        <button type="submit" className="w-fit rounded bg-accent px-4 py-2 text-background hover:bg-accent-strong">
          Save
        </button>
      </form>
    </main>
  );
}
