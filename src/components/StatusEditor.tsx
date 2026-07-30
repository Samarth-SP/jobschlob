"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";

export const STATUSES = [
  "interested",
  "applied",
  "heard_back",
  "oa",
  "interview",
  "offer",
  "rejected",
  "ghosted",
  "archived",
];

export function StatusEditor({ jobId, status }: { jobId: string; status: string | null }) {
  const router = useRouter();

  async function setStatus(next: string) {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, status: next }),
    });
    router.refresh();
  }

  async function untrack() {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, remove: true }),
    });
    router.refresh();
  }

  return (
    <motion.div layout className="flex items-center gap-2 text-sm">
      <select
        value={status ?? ""}
        onChange={(e) => (e.target.value ? setStatus(e.target.value) : untrack())}
        className="rounded border border-ink-soft/30 bg-cream px-2 py-1 text-ink"
      >
        <option value="">not tracked</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
    </motion.div>
  );
}
