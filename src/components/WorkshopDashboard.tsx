"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type AtsNotes = { ok: boolean; missingSections: string[]; extractedPreview: string } | null;

type Doc = {
  id: number;
  kind: string;
  source: string;
  filename: string | null;
  latex: string | null;
  blobUrl: string | null;
  active: boolean;
  atsNotes: unknown; // jsonb from the DB — narrowed to AtsNotes at render, see asAtsNotes()
  createdAt: Date | string;
};

const KIND_LABELS: Record<string, string> = { resume: "Resume", cover_letter: "Cover letter" };

// atsNotes always comes from lib/ats-check.ts's checkAts() — either straight off a fresh API
// response or round-tripped through the jsonb column — so this narrowing is safe, not a guess.
function asAtsNotes(value: unknown): AtsNotes {
  return (value as AtsNotes) ?? null;
}

async function postAction(id: number, action: string, extra?: Record<string, unknown>) {
  const res = await fetch("/api/workshop/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function WorkshopDashboard({
  initialDocuments,
  jobs,
}: {
  initialDocuments: Doc[];
  jobs: { id: string; title: string; company: string }[];
}) {
  const [docs, setDocs] = useState(initialDocuments);
  const [kind, setKind] = useState<"resume" | "cover_letter">("resume");
  const [jobId, setJobId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [pdfReloadToken, setPdfReloadToken] = useState(0);
  const [draftLatex, setDraftLatex] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const openDoc = docs.find((d) => d.id === openId) ?? null;
  const openAtsNotes = openDoc ? asAtsNotes(openDoc.atsNotes) : null;

  useEffect(() => {
    if (openDoc) setDraftLatex(openDoc.latex ?? "");
  }, [openDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function setBusy(id: number, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Both generate and upload land the same way: prepend to the list, deactivate any other
  // document of the same kind, and open the panel — a resume that just got produced should be
  // immediately reviewable, not something you have to go hunting for.
  function addDoc(doc: Doc) {
    setDocs((prev) => [doc, ...prev.map((d) => (d.kind === doc.kind ? { ...d, active: false } : d))]);
    setOpenId(doc.id);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/workshop/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, jobId: jobId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      addDoc({
        id: data.id,
        kind: data.kind,
        source: "generated",
        filename: data.filename,
        latex: data.latex,
        blobUrl: "stored", // real value lives server-side; only used here for UI truthiness
        active: true,
        atsNotes: data.atsNotes,
        createdAt: new Date(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

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
      addDoc({
        id: data.id,
        kind: data.kind,
        source: "uploaded",
        filename: data.filename,
        latex: null,
        blobUrl: "stored",
        active: true,
        atsNotes: data.atsNotes,
        createdAt: new Date(),
      });
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
    await postAction(id, "activate").catch(() => {});
  }

  async function remove(id: number) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (openId === id) setOpenId(null);
    await postAction(id, "delete").catch(() => {});
  }

  async function rescan(id: number) {
    setBusy(id, true);
    try {
      const data = await postAction(id, "rescan");
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, atsNotes: data.atsNotes } : d)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-scan failed");
    } finally {
      setBusy(id, false);
    }
  }

  async function recompile(id: number) {
    setBusy(id, true);
    try {
      const data = await postAction(id, "recompile", { latex: draftLatex });
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, latex: draftLatex, atsNotes: data.atsNotes } : d)));
      setPdfReloadToken((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recompile failed");
    } finally {
      setBusy(id, false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
        <button
          onClick={generate}
          disabled={generating}
          className="rounded bg-accent px-4 py-1.5 text-sm text-background hover:bg-accent-strong disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate"}
        </button>
        <span className="text-foreground-muted">or</span>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          className="text-sm text-foreground-muted file:mr-3 file:rounded file:border-0 file:bg-accent/80 file:px-3 file:py-1.5 file:text-sm file:text-background hover:file:bg-accent-strong"
        />
        {uploading && <span className="text-sm text-foreground-muted">Uploading…</span>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {docs.map((doc) => (
            <motion.button
              key={doc.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenId(doc.id)}
              className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-left text-sm transition-colors ${
                doc.active ? "border-accent/50 bg-accent/10" : "border-accent/20 bg-surface hover:border-accent/35"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-foreground">
                  {KIND_LABELS[doc.kind] ?? doc.kind} — {doc.filename ?? `Generated ${new Date(doc.createdAt).toLocaleDateString()}`}
                </span>
                <span className="text-xs text-foreground-muted">
                  {doc.source === "uploaded" ? "Uploaded" : "Generated"}
                  {doc.active ? " · active" : ""}
                  {asAtsNotes(doc.atsNotes) && !asAtsNotes(doc.atsNotes)?.ok ? " · ATS issues" : ""}
                </span>
              </div>
              <span className="text-xs text-accent underline">Open →</span>
            </motion.button>
          ))}
        </AnimatePresence>
        {docs.length === 0 && <p className="text-sm text-foreground-muted">No documents yet.</p>}
      </div>

      <AnimatePresence>
        {openDoc && (
          <motion.div
            className="fixed inset-0 z-50 flex justify-end bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              className="flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-accent/15 px-5 py-3">
                <div>
                  <p className="font-medium text-foreground">
                    {KIND_LABELS[openDoc.kind] ?? openDoc.kind} — {openDoc.filename ?? "untitled"}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {openDoc.source === "uploaded" ? "Uploaded" : "Generated"}
                    {openDoc.active ? " · active" : ""}
                  </p>
                </div>
                <button onClick={() => setOpenId(null)} className="rounded px-2 py-1 text-sm text-foreground-muted hover:text-foreground">
                  Close ✕
                </button>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1 border-r border-accent/15 bg-surface">
                  <embed
                    key={pdfReloadToken}
                    src={`/api/workshop/documents?id=${openDoc.id}&t=${pdfReloadToken}`}
                    type="application/pdf"
                    className="h-full w-full"
                  />
                </div>

                <div className="flex w-full max-w-sm flex-col gap-4 overflow-y-auto p-4">
                  {openAtsNotes && (
                    <div
                      className={`rounded border p-3 text-sm ${
                        openAtsNotes.ok ? "border-pop/40 bg-pop-tint text-foreground" : "border-red-700/40 bg-red-50 text-red-800"
                      }`}
                    >
                      <p className="font-medium">{openAtsNotes.ok ? "ATS check passed" : "ATS check failed"}</p>
                      {!openAtsNotes.ok && (
                        <ul className="mt-1 list-inside list-disc">
                          {openAtsNotes.missingSections.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => rescan(openDoc.id)}
                    disabled={busyIds.has(openDoc.id)}
                    className="w-fit rounded border border-accent/30 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    {busyIds.has(openDoc.id) ? "Scanning…" : "Re-scan ATS"}
                  </button>

                  {openDoc.latex !== null ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium text-foreground">Edit wording (LaTeX source)</p>
                      <textarea
                        value={draftLatex}
                        onChange={(e) => setDraftLatex(e.target.value)}
                        rows={16}
                        className="rounded border border-accent/30 bg-surface p-2 font-mono text-xs text-foreground"
                      />
                      <button
                        onClick={() => recompile(openDoc.id)}
                        disabled={busyIds.has(openDoc.id) || draftLatex === openDoc.latex}
                        className="w-fit rounded bg-accent px-3 py-1.5 text-sm text-background hover:bg-accent-strong disabled:opacity-50"
                      >
                        {busyIds.has(openDoc.id) ? "Recompiling…" : "Save & recompile"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-muted">
                      This was uploaded directly — no LaTeX source to edit in place. Delete and upload a revised PDF instead.
                    </p>
                  )}

                  <div className="mt-auto flex gap-3 border-t border-accent/15 pt-3">
                    {!openDoc.active && (
                      <button onClick={() => activate(openDoc.id)} className="text-sm text-accent underline">
                        Set active
                      </button>
                    )}
                    <button onClick={() => remove(openDoc.id)} className="text-sm text-red-700 underline">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
