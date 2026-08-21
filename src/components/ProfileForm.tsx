"use client";

import { useActionState } from "react";
import { motion, AnimatePresence } from "motion/react";

export type SaveResult = { rescored: number } | null;

export function ProfileForm({
  action,
  initialBackground,
}: {
  action: (prev: SaveResult, formData: FormData) => Promise<SaveResult>;
  initialBackground: string;
}) {
  const [result, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="background"
        defaultValue={initialBackground}
        rows={20}
        className="rounded border border-accent/30 bg-surface p-3 text-sm text-foreground"
        placeholder="Software engineer with 5 years building backend systems in Go and Python..."
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded bg-accent px-4 py-2 text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <AnimatePresence mode="wait">
          {isPending ? (
            <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-foreground-muted">
              Rescoring board…
            </motion.span>
          ) : (
            result && (
              <motion.span
                key={`saved-${result.rescored}-${Date.now()}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-accent"
              >
                Saved — rescored {result.rescored} job{result.rescored === 1 ? "" : "s"} on the board
              </motion.span>
            )
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
