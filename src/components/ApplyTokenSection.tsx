"use client";

import { useState } from "react";

// Shown once, right after generation — only the SHA-256 hash is stored server-side (see
// lib/apply-token.ts), so this is the only chance to see/copy the raw token before it's gone.
export function ApplyTokenSection({
  hasToken,
  regenerate,
  clear,
}: {
  hasToken: boolean;
  regenerate: () => Promise<string>;
  clear: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [set, setSet] = useState(hasToken);

  async function onRegenerate() {
    setBusy(true);
    try {
      const token = await regenerate();
      setRevealed(token);
      setSet(true);
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      await clear();
      setRevealed(null);
      setSet(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Auto-apply worker token</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Paste this into <code>.env</code> as <code>JOBSCHLOB_API_TOKEN</code> on the machine running{" "}
          <code>boof sync</code> — that&apos;s how the local worker authenticates to queue-fetch and report back, without
          your NextAuth session.
        </p>
      </div>

      {revealed && (
        <div className="rounded border border-accent/40 bg-accent/10 p-3">
          <p className="mb-1 text-xs font-medium text-foreground">
            Copy this now — it won&apos;t be shown again:
          </p>
          <code className="block break-all rounded bg-background px-2 py-1.5 text-xs text-foreground">{revealed}</code>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <span className="text-foreground-muted">{set ? "A token is currently set." : "No token set yet."}</span>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="rounded bg-accent px-3 py-1.5 text-background hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Working…" : set ? "Regenerate" : "Generate"}
        </button>
        {set && (
          <button onClick={onClear} disabled={busy} className="rounded border border-red-700/40 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
