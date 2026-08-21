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

function warningsText(warnings: unknown): string | null {
  return Array.isArray(warnings) && warnings.length ? warnings.join(" ") : null;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [pdfReloadToken, setPdfReloadToken] = useState(0);
  const [draftLatex, setDraftLatex] = useState("");
  const [dirty, setDirty] = useState(false);
  const texInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const recompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDoc = docs.find((d) => d.id === openId) ?? null;
  const openAtsNotes = openDoc ? asAtsNotes(openDoc.atsNotes) : null;

  useEffect(() => {
    if (recompileTimer.current) clearTimeout(recompileTimer.current);
    setDirty(false);
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
    setNotice(null);
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
      setNotice(warningsText(data.warnings));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // A .tex file is required — a bare PDF has no source to workshop, which is the entire point of
  // this page (see the panel's editor below). The PDF is optional: give us one and we store it
  // as-is, skip it and we compile the .tex ourselves.
  async function upload() {
    const texFile = texInput.current?.files?.[0];
    if (!texFile) {
      setError("A .tex file is required — a PDF alone can't be edited here.");
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("tex", texFile);
      const pdfFile = pdfInput.current?.files?.[0];
      if (pdfFile) form.append("pdf", pdfFile);
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
        latex: data.latex,
        blobUrl: "stored",
        active: true,
        atsNotes: data.atsNotes,
        createdAt: new Date(),
      });
      setNotice(warningsText(data.warnings));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (texInput.current) texInput.current.value = "";
      if (pdfInput.current) pdfInput.current.value = "";
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
    setError(null);
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

  async function recompile(id: number, latex: string) {
    if (recompileTimer.current) clearTimeout(recompileTimer.current);
    setError(null);
    setNotice(null);
    setBusy(id, true);
    try {
      const data = await postAction(id, "recompile", { latex });
      // data.latex is the CLEANED source (unsupported primitives auto-stripped server-side, see
      // lib/latex.ts) — store and show that, not what was sent, so the editor never silently
      // diverges from what's actually compiled.
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, latex: data.latex, atsNotes: data.atsNotes } : d)));
      setDraftLatex(data.latex);
      setPdfReloadToken((t) => t + 1);
      setDirty(false);
      setNotice(warningsText(data.warnings));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recompile failed");
    } finally {
      setBusy(id, false);
    }
  }

  // Overleaf-style live preview, minus the WASM LaTeX engine Overleaf itself doesn't even use —
  // no Overleaf plugin/embed exists to pull in, and a browser LaTeX engine (SwiftLaTeX etc.) would
  // hit the exact same "arbitrary packages don't compile" wall the upload flow already hit, just
  // with a multi-MB WASM download on top. Debouncing the existing server-side Tectonic compile
  // gets the same felt experience — edits, pauses, and the PDF catches up — with zero new deps.
  function onLatexChange(id: number, next: string) {
    setDraftLatex(next);
    setDirty(true);
    if (recompileTimer.current) clearTimeout(recompileTimer.current);
    recompileTimer.current = setTimeout(() => recompile(id, next), 1200);
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
        <span className="text-foreground-muted">or bring your own —</span>
        <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
          .tex (required)
          <input ref={texInput} type="file" accept=".tex" disabled={uploading} className="text-xs" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
          .pdf (optional — we'll compile the .tex if you skip this)
          <input ref={pdfInput} type="file" accept="application/pdf" disabled={uploading} className="text-xs" />
        </label>
        <button
          onClick={upload}
          disabled={uploading}
          className="rounded border border-accent/30 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {/* Fixed above the panel's z-50 overlay — an action taken inside the panel (recompile,
          rescan) needs its error visible while the panel is open, not hidden behind it until
          you close it. */}
      {error && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded border border-red-700/40 bg-red-50 px-4 py-2 text-sm text-red-800 shadow-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">
            Dismiss
          </button>
        </div>
      )}
      {!error && notice && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded border border-accent/40 bg-pop-tint px-4 py-2 text-sm text-foreground shadow-lg">
          {notice}
          <button onClick={() => setNotice(null)} className="ml-3 underline">
            Dismiss
          </button>
        </div>
      )}

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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              className="flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
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

              <div className="flex flex-wrap items-center gap-3 border-b border-accent/15 bg-surface px-5 py-2.5 text-sm">
                {openAtsNotes && (
                  <span className={openAtsNotes.ok ? "text-accent" : "text-red-700"}>
                    {openAtsNotes.ok ? "✓ ATS check passed" : `✕ ATS issues: ${openAtsNotes.missingSections.join(", ")}`}
                  </span>
                )}
                <button
                  onClick={() => rescan(openDoc.id)}
                  disabled={busyIds.has(openDoc.id)}
                  className="rounded border border-accent/30 px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  {busyIds.has(openDoc.id) ? "Scanning…" : "Re-scan ATS"}
                </button>
                {openDoc.latex !== null && (
                  <>
                    <button
                      onClick={() => recompile(openDoc.id, draftLatex)}
                      disabled={busyIds.has(openDoc.id) || draftLatex === openDoc.latex}
                      className="rounded bg-accent px-3 py-1 text-xs text-background hover:bg-accent-strong disabled:opacity-50"
                    >
                      {busyIds.has(openDoc.id) ? "Recompiling…" : "Recompile now"}
                    </button>
                    <span className="text-xs text-foreground-muted">
                      {busyIds.has(openDoc.id) ? "· recompiling…" : dirty ? "· editing, will auto-recompile…" : "· up to date"}
                    </span>
                  </>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {!openDoc.active && (
                    <button onClick={() => activate(openDoc.id)} className="text-xs text-accent underline">
                      Set active
                    </button>
                  )}
                  <button onClick={() => remove(openDoc.id)} className="text-xs text-red-700 underline">
                    Delete
                  </button>
                </div>
              </div>

              {/* Overleaf-style split: source on the left, rendered PDF on the right, both full height. */}
              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col border-r border-accent/15">
                  {openDoc.latex !== null ? (
                    <textarea
                      value={draftLatex}
                      onChange={(e) => onLatexChange(openDoc.id, e.target.value)}
                      spellCheck={false}
                      className="h-full w-full resize-none bg-surface p-4 font-mono text-xs leading-relaxed text-foreground focus:outline-none"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-foreground-muted">
                      No LaTeX source on this document — it predates the .tex-required upload flow. Delete and re-upload with a
                      .tex file to edit it here.
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 bg-surface">
                  <embed
                    key={pdfReloadToken}
                    src={`/api/workshop/documents?id=${openDoc.id}&t=${pdfReloadToken}`}
                    type="application/pdf"
                    className="h-full w-full"
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
