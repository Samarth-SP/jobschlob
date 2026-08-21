"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type Doc = {
  id: number;
  kind: string;
  source: string;
  filename: string | null;
  blobUrl: string | null;
  active: boolean;
  atsNotes: unknown;
  createdAt: Date | string;
};

const KIND_LABELS: Record<string, string> = { resume: "Resume", cover_letter: "Cover letter" };

export function DocumentLibrary({
  initialDocuments,
  jobs,
}: {
  initialDocuments: Doc[];
  jobs: { id: string; title: string; company: string }[];
}) {
  const [docs, setDocs] = useState(initialDocuments);
  const [kind, setKind] = useState<"resume" | "cover_letter">("resume");
  const [jobId, setJobId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (jobId) form.append("jobId", jobId);
      const res = await fetch("/api/workshop/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDocs((prev) => [
        { id: data.id, kind, source: "uploaded", filename: data.filename, blobUrl: "stored", active: true, atsNotes: data.atsNotes, createdAt: new Date() },
        ...prev.map((d) => (d.kind === kind ? { ...d, active: false } : d)),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function activate(id: number) {
    const target = docs.find((d) => d.id === id);
    if (!target) return;
    setDocs((prev) => prev.map((d) => (d.kind === target.kind ? { ...d, active: d.id === id } : d)));
    await fetch("/api/workshop/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "activate" }),
    });
  }

  async function remove(id: number) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    await fetch("/api/workshop/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "delete" }),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-pop">Document library</h2>
      <p className="text-sm text-foreground-muted">
        Upload an already-tailored PDF resume or cover letter to keep it alongside anything the
        workshop generates. The one marked <span className="text-accent">active</span> is your
        current pick per document type.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded border border-dashed border-accent/40 bg-surface p-4">
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
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          className="text-sm text-foreground-muted file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:text-background hover:file:bg-accent-strong"
        />
        {uploading && <span className="text-sm text-foreground-muted">Uploading…</span>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {docs.map((doc) => (
            <motion.div
              key={doc.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm ${
                doc.active ? "border-accent/50 bg-accent/10" : "border-accent/20 bg-surface"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-foreground">
                  {KIND_LABELS[doc.kind] ?? doc.kind} — {doc.filename ?? `Generated ${new Date(doc.createdAt).toLocaleDateString()}`}
                </span>
                <span className="text-xs text-foreground-muted">
                  {doc.source === "uploaded" ? "Uploaded" : "Generated"}
                  {doc.active ? " · active" : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {doc.blobUrl && (
                  <a href={`/api/workshop/documents?id=${doc.id}`} target="_blank" rel="noreferrer" className="text-accent underline">
                    View
                  </a>
                )}
                {!doc.active && (
                  <button onClick={() => activate(doc.id)} className="text-accent underline">
                    Set active
                  </button>
                )}
                <button onClick={() => remove(doc.id)} className="text-red-700 underline">
                  Delete
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {docs.length === 0 && <p className="text-sm text-foreground-muted">No documents yet.</p>}
      </div>
    </div>
  );
}
