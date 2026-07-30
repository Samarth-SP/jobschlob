import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { AsciiHero } from "@/components/AsciiHero";
import { SceneArt } from "@/components/SceneArt";

export default async function Home() {
  const session = await auth();
  if (session?.user?.email) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center px-6 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <AsciiHero />
        <p className="max-w-md text-foreground-muted">
          One board. Jobs ranked by how well they match your background, applications tracked
          start to finish, and a workshop to tailor your resume for each one.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button
            className="rounded bg-accent px-5 py-2.5 font-medium text-background transition-colors hover:bg-accent-strong"
            type="submit"
          >
            Sign in with GitHub
          </button>
        </form>
      </div>
      <div className="pb-6">
        <SceneArt />
      </div>
    </main>
  );
}
