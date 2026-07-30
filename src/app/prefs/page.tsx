import { auth } from "@/lib/auth";
import { getPreferences, setPreferences } from "@/db/queries";
import { revalidatePath } from "next/cache";

export default async function PrefsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to edit preferences.</main>;
  }
  const userId = session.user.email;
  const weights = await getPreferences(userId);

  async function save(formData: FormData) {
    "use server";
    const lines = String(formData.get("weights") ?? "").split("\n");
    const next: Record<string, number> = {};
    for (const line of lines) {
      const [keyword, weight] = line.split(",").map((s) => s.trim());
      if (keyword && weight) next[keyword] = Number(weight) || 0;
    }
    await setPreferences(userId, next);
    revalidatePath("/prefs");
  }

  const text = Object.entries(weights)
    .map(([k, v]) => `${k}, ${v}`)
    .join("\n");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold">Preferences</h1>
      <p className="text-sm text-zinc-500">
        One keyword per line, as <code>keyword, weight</code>. Weights add up for any job whose
        title/company/location contains the keyword — used to sort the board.
      </p>
      <form action={save} className="flex flex-col gap-3">
        <textarea
          name="weights"
          defaultValue={text}
          rows={10}
          className="rounded border p-3 font-mono text-sm"
          placeholder={"remote, 5\nstaff, 3\nrecruiting, -10"}
        />
        <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-white">
          Save
        </button>
      </form>
    </main>
  );
}
