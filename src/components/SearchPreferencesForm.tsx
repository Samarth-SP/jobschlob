"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SearchPreferences } from "@/lib/search-preferences";

export type SearchPrefsResult = { saved: true } | { error: string } | null;
export type RunNowResult = { found: number } | { error: string } | null;

type DraftFields = {
  tracks: string[];
  gradYear?: string;
  locationsPreferred: string[];
  locationsAcceptable: string[];
  criteria: string;
};

const csv = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function SearchPreferencesForm({
  action,
  runNow,
  refineQuestions,
  applyRefine,
  initial,
}: {
  action: (prev: SearchPrefsResult, formData: FormData) => Promise<SearchPrefsResult>;
  runNow: () => Promise<RunNowResult>;
  refineQuestions: (fields: DraftFields) => Promise<{ questions: string[] } | { error: string }>;
  applyRefine: (fields: DraftFields, qa: { question: string; answer: string }[]) => Promise<{ criteria: string } | { error: string }>;
  initial: SearchPreferences;
}) {
  const [result, formAction, isPending] = useActionState(action, null);
  const [runResult, setRunResult] = useState<RunNowResult>(null);
  const [isRunning, startRun] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);
  const [criteria, setCriteria] = useState(initial.criteria ?? "");
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isRefining, startRefine] = useTransition();
  const [isApplying, startApply] = useTransition();

  function currentFields(): DraftFields {
    const fd = new FormData(formRef.current!);
    return {
      tracks: csv(fd.get("tracks")),
      gradYear: String(fd.get("gradYear") ?? "").trim() || undefined,
      locationsPreferred: csv(fd.get("locationsPreferred")),
      locationsAcceptable: csv(fd.get("locationsAcceptable")),
      criteria,
    };
  }

  function onRefine() {
    setRefineError(null);
    startRefine(async () => {
      const res = await refineQuestions(currentFields());
      if ("error" in res) setRefineError(res.error);
      else {
        setQuestions(res.questions);
        setAnswers(res.questions.map(() => ""));
      }
    });
  }

  function onApplyAnswers() {
    if (!questions) return;
    setRefineError(null);
    startApply(async () => {
      const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
      const res = await applyRefine(currentFields(), qa);
      if ("error" in res) setRefineError(res.error);
      else {
        setCriteria(res.criteria);
        setQuestions(null);
        setAnswers([]);
      }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Personalized job search</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Describe what you&apos;re looking for and an LLM searches the web for it directly — results land on
          your dashboard like any other job. Uses your own Anthropic key from above if you&apos;ve set one, else
          the app&apos;s.
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
        <div className="flex items-center justify-between">
          <span>Other criteria (free text)</span>
          <button
            type="button"
            disabled={isRefining}
            onClick={onRefine}
            className="rounded border border-accent/50 px-2 py-0.5 text-xs text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {isRefining ? "Thinking…" : "Refine with AI"}
          </button>
        </div>
        <textarea
          name="criteria"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={3}
          placeholder="Wet-lab background, life sciences consulting, avoid pure quant roles…"
          className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
        />
      </label>

      {questions && (
        <div className="flex flex-col gap-2 rounded border border-accent/30 bg-background/50 p-3">
          <p className="text-xs text-foreground-muted">A few questions to sharpen this — answer what&apos;s useful, skip the rest:</p>
          {questions.map((q, i) => (
            <label key={i} className="flex flex-col gap-1 text-xs text-foreground-muted">
              <span>{q}</span>
              <input
                type="text"
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isApplying}
              onClick={onApplyAnswers}
              className="w-fit rounded bg-accent px-3 py-1.5 text-xs text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {isApplying ? "Applying…" : "Apply answers"}
            </button>
            <button
              type="button"
              onClick={() => {
                setQuestions(null);
                setAnswers([]);
              }}
              className="w-fit rounded border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {refineError && <p className="text-xs text-red-700">{refineError}</p>}

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
