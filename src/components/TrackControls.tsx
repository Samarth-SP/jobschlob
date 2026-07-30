"use client";

import { useRouter } from "next/navigation";

const STATUSES = ["interested", "applied", "interviewing", "offer", "rejected", "archived"];

export function TrackControls({ jobId, status }: { jobId: string; status: string | null }) {
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
    <div className="flex items-center gap-2 text-sm">
      <select
        value={status ?? ""}
        onChange={(e) => (e.target.value ? setStatus(e.target.value) : untrack())}
        className="rounded border px-2 py-1"
      >
        <option value="">not tracked</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
