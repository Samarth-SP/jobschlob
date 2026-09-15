"use client";

import { useState } from "react";

type ApplyStatus = { status: string; notes: string | null } | null;

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued for auto-apply",
  filled: "Filled — review & submit",
  needs_input: "Needs your input",
  error: "Auto-apply failed",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-foreground-muted",
  filled: "text-accent",
  needs_input: "text-yellow-700",
  error: "text-red-700",
};

// Queues a tracked job for the local BoofSimplify worker (see boof/remote.py) to prefill
// asynchronously — no browser tab to watch here; the worker picks this up on its own schedule and
// reports back via POST /api/apply/status, which flips `status` to one of the labels above.
export function ApplyQueueButton({ jobId, initialStatus }: { jobId: string; initialStatus: ApplyStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function queue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/apply/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to queue");
      setStatus({ status: data.task.status, notes: data.task.notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {status && (
        <span className={STATUS_COLOR[status.status] ?? "text-foreground-muted"} title={status.notes ?? undefined}>
          {STATUS_LABEL[status.status] ?? status.status}
        </span>
      )}
      <button
        onClick={queue}
        disabled={busy}
        className="rounded border border-accent/30 px-2 py-1 text-accent hover:bg-accent/10 disabled:opacity-50"
      >
        {busy ? "Queuing…" : status ? "Re-queue" : "Queue for auto-apply"}
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
