"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type AtsNotes = { ok: boolean; missingSections: string[]; extractedPreview: string };
type Result = { documentId: number; latex: string; atsNotes: AtsNotes; pdfBase64: string };

export function WorkshopForm({ jobs }: { jobs: { id: string; title: string; company: string }[] }) {
  const [kind, setKind] = useState<"resume" | "cover_letter">("resume");
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workshop/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, jobId: jobId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  const pdfUrl = result ? `data:application/pdf;base64,${result.pdfBase64}` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "resume" | "cover_letter")}
          className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="resume">Resume</option>
          <option value="cover_letter">Cover letter</option>
        </select>
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">General (no specific job)</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} — {j.company}
            </option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded bg-accent px-4 py-1.5 text-sm text-background hover:bg-accent-strong disabled:opacity-50"
        >
          {loading ? "Generating…" : result ? "Regenerate" : "Generate"}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {!result.atsNotes.ok && (
              <div className="rounded border border-red-700/40 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">ATS check failed</p>
                <ul className="list-inside list-disc">
                  {result.atsNotes.missingSections.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <button onClick={generate} className="mt-2 underline">
                  Regenerate
                </button>
              </div>
            )}
            {result.atsNotes.ok && (
              <p className="rounded border border-pop/40 bg-pop-tint p-3 text-sm text-foreground">
                ATS check passed — text extracted cleanly from the compiled PDF.
              </p>
            )}

            {pdfUrl && (
              <>
                <embed src={pdfUrl} type="application/pdf" className="h-[600px] w-full rounded border border-accent/20" />
                <a
                  href={pdfUrl}
                  download={`${kind}.pdf`}
                  className="w-fit text-sm text-accent underline"
                >
                  Download PDF
                </a>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
