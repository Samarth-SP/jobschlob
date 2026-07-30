import { auth } from "@/lib/auth";
import { getProfile, setProfile } from "@/db/queries";
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
    await setProfile(userId, String(formData.get("background") ?? ""));
    revalidatePath("/profile");
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
