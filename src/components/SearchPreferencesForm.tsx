"use client";

import { useActionState, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SearchPreferences } from "@/lib/search-preferences";

export type SearchPrefsResult = { saved: true } | { error: string } | null;
export type RunNowResult = { found: number } | { error: string } | null;

export function SearchPreferencesForm({
  action,
  runNow,
  initial,
}: {
  action: (prev: SearchPrefsResult, formData: FormData) => Promise<SearchPrefsResult>;
  runNow: () => Promise<RunNowResult>;
  initial: SearchPreferences;
}) {
  const [result, formAction, isPending] = useActionState(action, null);
  const [runResult, setRunResult] = useState<RunNowResult>(null);
  const [isRunning, startRun] = useTransition();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Personalized job search</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Describe what you&apos;re looking for and an LLM searches the web for it directly, using your own
          Anthropic key from above — results land on your dashboard like any other job. Requires an Anthropic
          key configured above; this never uses the app&apos;s shared key.
        </p>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        <input type="checkbox" name="enabled" value="1" defaultChecked={initial.enabled} />
        <span>Enabled (runs automatically each morning, plus on demand below)</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Tracks / categories (comma-separated)</span>
          <input
            type="text"
            name="tracks"
            defaultValue={initial.tracks.join(", ")}
            placeholder="consulting, tech consulting, swe, biotech"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Graduation year</span>
          <input
            type="text"
            name="gradYear"
            defaultValue={initial.gradYear ?? ""}
            placeholder="2027"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Preferred locations (comma-separated)</span>
          <input
            type="text"
            name="locationsPreferred"
            defaultValue={initial.locationsPreferred.join(", ")}
            placeholder="San Francisco, CA; New York, NY"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>Also acceptable (comma-separated)</span>
          <input
            type="text"
            name="locationsAcceptable"
            defaultValue={initial.locationsAcceptable.join(", ")}
            placeholder="Chicago, IL; Boston, MA"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
        <input type="checkbox" name="remoteOk" value="1" defaultChecked={initial.remoteOk ?? false} />
        <span>Remote is acceptable</span>
      </label>

      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        <span>Other criteria (free text)</span>
        <textarea
          name="criteria"
          defaultValue={initial.criteria ?? ""}
          rows={3}
          placeholder="Wet-lab background, life sciences consulting, avoid pure quant roles…"
          className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-accent px-4 py-2 text-sm text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => startRun(async () => setRunResult(await runNow()))}
          className="w-fit rounded border border-accent px-4 py-2 text-sm text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
        >
          {isRunning ? "Searching…" : "Search now"}
        </button>
        <AnimatePresence mode="wait">
          {result && (
            <motion.span
              key={`prefs-${Date.now()}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={"error" in (result ?? {}) ? "text-sm text-red-700" : "text-sm text-accent"}
            >
              {"error" in (result ?? {}) ? (result as { error: string }).error : "Saved"}
            </motion.span>
          )}
          {runResult && (
            <motion.span
              key={`run-${Date.now()}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={"error" in (runResult ?? {}) ? "text-sm text-red-700" : "text-sm text-accent"}
            >
              {"error" in (runResult ?? {}) ? (runResult as { error: string }).error : `Found ${(runResult as { found: number }).found} job(s)`}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
