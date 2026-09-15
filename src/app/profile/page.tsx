import { auth } from "@/lib/auth";
import {
  getProfile,
  setProfile,
  getJobsSince,
  saveJobMatches,
  getLlmConfig,
  setLlmConfig,
  getIdentity,
  setIdentity,
  hasApplyToken,
  regenerateApplyToken,
  clearApplyToken,
} from "@/db/queries";
import { scoreJobForUser } from "@/lib/match";
import { EXTENDED_RETENTION_DAYS } from "@/lib/company-tier";
import { revalidatePath } from "next/cache";
import { ProfileForm, type SaveResult } from "@/components/ProfileForm";
import { LlmSettingsForm, type LlmSettingsResult, type RedactedLlmConfig } from "@/components/LlmSettingsForm";
import { IdentityForm, type IdentityResult } from "@/components/IdentityForm";
import { ApplyTokenSection } from "@/components/ApplyTokenSection";
import { encryptSecret } from "@/lib/crypto";
import { LLM_PROCESSES, type LlmConfig, type LlmProcess, type Provider } from "@/lib/llm-config";
import type { ApplyIdentity } from "@/lib/apply-identity";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to edit your profile.</main>;
  }
  const userId = session.user.email;
  const background = await getProfile(userId);
  const llmConfig = await getLlmConfig(userId);
  const redactedLlmConfig: RedactedLlmConfig = {
    anthropicKeySet: Boolean(llmConfig?.keys?.anthropic),
    openaiKeySet: Boolean(llmConfig?.keys?.openai),
    routing: llmConfig?.routing ?? {},
  };
  const identity = (await getIdentity(userId)) ?? {};
  const applyTokenSet = await hasApplyToken(userId);

  async function save(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
    "use server";
    const background = String(formData.get("background") ?? "");
    await setProfile(userId, background);
    revalidatePath("/profile");

    // Force re-matching against everything currently on the board — otherwise a rewritten
    // background leaves every existing jobMatches row stale until ingest happens to re-touch
    // that job (which, for an already-seen job, it never does; see getMatchedJobIds). jobMatches
    // is keyed (userId, jobId), so this is a plain upsert, not a delete-then-reinsert. The
    // returned count is what tells the save button rescoring actually happened — the keyword
    // scorer only looks at a job's own title/company tokens, so a background edit often doesn't
    // move the number at all, which otherwise reads as "nothing happened."
    if (!background.trim()) return { rescored: 0 };
    const cutoff = new Date(Date.now() - EXTENDED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const recentJobs = await getJobsSince(cutoff);
    const matches = recentJobs.flatMap((job) => {
      const result = scoreJobForUser(job, background);
      return result ? [{ userId, jobId: job.id, ...result }] : [];
    });
    await saveJobMatches(matches);
    revalidatePath("/dashboard");
    return { rescored: matches.length };
  }

  async function saveLlm(_prev: LlmSettingsResult, formData: FormData): Promise<LlmSettingsResult> {
    "use server";
    try {
      // Merge onto whatever's already stored — a blank key field means "keep it", not "clear
      // it" (only the explicit "remove" checkbox clears one), so re-reading here avoids a save
      // of the routing fields alone wiping out a previously-stored key.
      const current = (await getLlmConfig(userId)) ?? {};
      const keys = { ...current.keys };

      const anthropicKey = String(formData.get("anthropicKey") ?? "").trim();
      if (formData.get("clearAnthropicKey")) delete keys.anthropic;
      else if (anthropicKey) keys.anthropic = encryptSecret(anthropicKey);

      const openaiKey = String(formData.get("openaiKey") ?? "").trim();
      if (formData.get("clearOpenaiKey")) delete keys.openai;
      else if (openaiKey) keys.openai = encryptSecret(openaiKey);

      const routing: LlmConfig["routing"] = {};
      for (const proc of LLM_PROCESSES) {
        const provider = String(formData.get(`${proc}Provider`) ?? "") as Provider | "";
        if (provider !== "anthropic" && provider !== "openai") continue; // "" = app default, no entry
        const model = String(formData.get(`${proc}Model`) ?? "").trim();
        routing[proc as LlmProcess] = model ? { provider, model } : { provider };
      }

      await setLlmConfig(userId, { keys, routing });
      revalidatePath("/profile");
      return { saved: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to save" };
    }
  }

  async function saveIdentity(_prev: IdentityResult, formData: FormData): Promise<IdentityResult> {
    "use server";
    const str = (k: string) => String(formData.get(k) ?? "").trim();
    const tri = (k: string): boolean | null => {
      const v = formData.get(k);
      return v === "yes" ? true : v === "no" ? false : null;
    };
    const next: ApplyIdentity = {
      fullName: str("fullName"),
      email: str("email"),
      phone: str("phone"),
      location: str("location"),
      links: { linkedin: str("linkedin"), github: str("github"), portfolio: str("portfolio") },
      workAuthorization: str("workAuthorization"),
      requiresSponsorship: tri("requiresSponsorship"),
      willingToRelocate: tri("willingToRelocate"),
      remotePreference: str("remotePreference"),
      desiredCompensation: str("desiredCompensation"),
      earliestStart: str("earliestStart"),
      noticePeriod: str("noticePeriod"),
      pronouns: str("pronouns"),
      eeo: {
        gender: str("eeoGender"),
        race: str("eeoRace"),
        veteran: str("eeoVeteran"),
        disability: str("eeoDisability"),
        hispanic: str("eeoHispanic"),
      },
    };
    await setIdentity(userId, next);
    revalidatePath("/profile");
    return { saved: true };
  }

  async function regenerateToken(): Promise<string> {
    "use server";
    const token = await regenerateApplyToken(userId);
    revalidatePath("/profile");
    return token;
  }

  async function clearToken(): Promise<void> {
    "use server";
    await clearApplyToken(userId);
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
      <ProfileForm action={save} initialBackground={background} />
      <LlmSettingsForm action={saveLlm} initial={redactedLlmConfig} />
      <IdentityForm action={saveIdentity} initial={identity} />
      <ApplyTokenSection hasToken={applyTokenSet} regenerate={regenerateToken} clear={clearToken} />
    </main>
  );
}
