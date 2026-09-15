"use client";

import { useActionState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LLM_PROCESSES, PROCESS_LABELS, type LlmProcess, type ProcessRoute } from "@/lib/llm-config";

export type LlmSettingsResult = { saved: true } | { error: string } | null;

// What the server sends down: never the actual key values (even encrypted), just whether one is
// currently stored, plus the current routing choices.
export type RedactedLlmConfig = {
  anthropicKeySet: boolean;
  openaiKeySet: boolean;
  routing: Partial<Record<LlmProcess, ProcessRoute>>;
};

export function LlmSettingsForm({
  action,
  initial,
}: {
  action: (prev: LlmSettingsResult, formData: FormData) => Promise<LlmSettingsResult>;
  initial: RedactedLlmConfig;
}) {
  const [result, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">LLM keys &amp; routing</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Bring your own Anthropic and/or OpenAI key, and choose which one powers each step below. Leave a key blank to
          keep what&apos;s already stored; check &quot;remove&quot; to clear it. With nothing configured, everything uses this
          app&apos;s own Anthropic key.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>
            Anthropic API key {initial.anthropicKeySet && <span className="text-accent">(currently set)</span>}
          </span>
          <input
            type="password"
            name="anthropicKey"
            placeholder={initial.anthropicKeySet ? "•••••••••••••• (leave blank to keep)" : "sk-ant-…"}
            autoComplete="off"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
          {initial.anthropicKeySet && (
            <label className="mt-1 flex items-center gap-1.5">
              <input type="checkbox" name="clearAnthropicKey" value="1" />
              <span>Remove stored key</span>
            </label>
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          <span>OpenAI API key {initial.openaiKeySet && <span className="text-accent">(currently set)</span>}</span>
          <input
            type="password"
            name="openaiKey"
            placeholder={initial.openaiKeySet ? "•••••••••••••• (leave blank to keep)" : "sk-…"}
            autoComplete="off"
            className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
          />
          {initial.openaiKeySet && (
            <label className="mt-1 flex items-center gap-1.5">
              <input type="checkbox" name="clearOpenaiKey" value="1" />
              <span>Remove stored key</span>
            </label>
          )}
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {LLM_PROCESSES.map((proc: LlmProcess) => (
          <div key={proc} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-44 shrink-0 text-foreground-muted">{PROCESS_LABELS[proc]}</span>
            <select
              name={`${proc}Provider`}
              defaultValue={initial.routing[proc]?.provider ?? ""}
              className="rounded border border-accent/30 bg-background px-2 py-1 text-foreground"
            >
              <option value="">App default (Anthropic)</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <input
              type="text"
              name={`${proc}Model`}
              defaultValue={initial.routing[proc]?.model ?? ""}
              placeholder="model override (optional)"
              className="w-48 rounded border border-accent/30 bg-background px-2 py-1 text-foreground placeholder:text-foreground-muted/60"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-accent px-4 py-2 text-sm text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <AnimatePresence mode="wait">
          {result && (
            <motion.span
              key={`llm-${Date.now()}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={"error" in (result ?? {}) ? "text-sm text-red-700" : "text-sm text-accent"}
            >
              {"error" in (result ?? {}) ? (result as { error: string }).error : "Saved"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
