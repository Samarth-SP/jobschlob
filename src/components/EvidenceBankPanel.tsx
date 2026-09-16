"use client";

import { useState, useTransition } from "react";
import type { EvidenceBank } from "@/lib/evidence";
import type { Gap } from "@/lib/evidence-interview";

type SaveResult = { ok: true } | { error: string };
type QuestionsResult = { questions: string[] } | { error: string };
type AnswerResult = { ok: true } | { error: string };

export function EvidenceBankPanel({
  initialBank,
  initialGaps,
  saveBank,
  askGap,
  answerGap,
}: {
  initialBank: EvidenceBank | null;
  initialGaps: Gap[];
  saveBank: (bank: EvidenceBank) => Promise<SaveResult>;
  askGap: (gap: Gap) => Promise<QuestionsResult>;
  answerGap: (gap: Gap, qa: { question: string; answer: string }[]) => Promise<AnswerResult>;
}) {
  const [bank, setBank] = useState<EvidenceBank | null>(initialBank);
  const [gaps, setGaps] = useState<Gap[]>(initialGaps);
  const [preview, setPreview] = useState<EvidenceBank | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, startSave] = useTransition();

  async function onFileChosen(file: File) {
    setUploadError(null);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/evidence/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setPreview(data.bank as EvidenceBank);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsUploading(false);
    }
  }

  function onConfirmPreview() {
    if (!preview) return;
    startSave(async () => {
      const res = await saveBank(preview);
      if ("error" in res) {
        setUploadError(res.error);
        return;
      }
      setBank(preview);
      setPreview(null);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-accent/20 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Evidence bank</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Upload your resume and the workshop reads it into structured, citable evidence — bullet by bullet —
          instead of scaffolding everything from one flat block of text. Re-upload any time to replace it.
        </p>
      </div>

      <label className="w-fit cursor-pointer rounded border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft">
        {isUploading ? "Reading…" : "Upload resume (PDF / txt / md)"}
        <input
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFileChosen(f);
            e.target.value = "";
          }}
        />
      </label>
      {uploadError && <p className="text-xs text-red-700">{uploadError}</p>}

      {preview && (
        <div className="flex flex-col gap-2 rounded border border-accent/30 bg-background/50 p-3">
          <p className="text-xs text-foreground-muted">
            Found {preview.experiences.length} role(s), {preview.projects.length} project(s), {preview.education.length}{" "}
            degree(s), {Object.values(preview.skills).flat().length} skill(s). Saving replaces your current evidence bank.
          </p>
          <BankSummary bank={preview} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onConfirmPreview}
              className="w-fit rounded bg-accent px-3 py-1.5 text-xs text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save to profile"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="w-fit rounded border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {bank && !preview && <BankSummary bank={bank} />}

      {gaps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">Strengthen your evidence</p>
          <p className="text-xs text-foreground-muted">
            These are the thinnest spots in your bank — a quick follow-up turns a vague line into something the
            workshop can actually cite.
          </p>
          {gaps.map((gap) => (
            <GapCard
              key={`${gap.kind}-${gap.id}`}
              gap={gap}
              askGap={askGap}
              answerGap={answerGap}
              onDone={() => setGaps((prev) => prev.filter((g) => !(g.kind === gap.kind && g.id === gap.id)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BankSummary({ bank }: { bank: EvidenceBank }) {
  if (!bank.experiences.length && !bank.projects.length && !bank.education.length) {
    return <p className="text-xs text-foreground-muted">Nothing extracted yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-xs text-foreground-muted">
      {bank.experiences.map((e) => (
        <li key={e.id}>
          <strong className="text-foreground">{e.title}</strong>
          {e.org ? ` — ${e.org}` : ""} ({e.bullets.length} bullet{e.bullets.length === 1 ? "" : "s"})
        </li>
      ))}
      {bank.projects.map((p) => (
        <li key={p.id}>
          <strong className="text-foreground">{p.title}</strong> ({p.bullets.length} bullet{p.bullets.length === 1 ? "" : "s"})
        </li>
      ))}
      {bank.leadership.map((l) => (
        <li key={l.id}>
          <strong className="text-foreground">{l.title}</strong>
          {l.org ? ` — ${l.org}` : ""} ({l.bullets.length} bullet{l.bullets.length === 1 ? "" : "s"})
        </li>
      ))}
      {bank.education.map((ed) => (
        <li key={ed.id}>
          <strong className="text-foreground">{ed.school}</strong>
          {ed.degree ? ` — ${ed.degree}` : ""}
        </li>
      ))}
    </ul>
  );
}

function GapCard({
  gap,
  askGap,
  answerGap,
  onDone,
}: {
  gap: Gap;
  askGap: (gap: Gap) => Promise<QuestionsResult>;
  answerGap: (gap: Gap, qa: { question: string; answer: string }[]) => Promise<AnswerResult>;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAsking, startAsk] = useTransition();
  const [isSaving, startSaveAns] = useTransition();

  function onAsk() {
    setError(null);
    startAsk(async () => {
      const res = await askGap(gap);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setQuestions(res.questions);
      setAnswers(res.questions.map(() => ""));
    });
  }

  function onSave() {
    if (!questions) return;
    setError(null);
    startSaveAns(async () => {
      const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
      const res = await answerGap(gap, qa);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="rounded border border-accent/20 bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-xs text-foreground">{gap.label}</strong>
        {gap.org && <span className="text-xs text-foreground-muted">{gap.org}</span>}
        <span className="text-xs text-foreground-muted">{gap.reason}</span>
        {!questions && (
          <button
            type="button"
            disabled={isAsking}
            onClick={onAsk}
            className="ml-auto rounded border border-accent/50 px-2 py-0.5 text-xs text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {isAsking ? "Thinking…" : "Get follow-up questions"}
          </button>
        )}
      </div>
      {questions && (
        <div className="mt-2 flex flex-col gap-2">
          {questions.map((q, i) => (
            <label key={i} className="flex flex-col gap-1 text-xs text-foreground-muted">
              <span>{q}</span>
              <textarea
                rows={2}
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                className="rounded border border-accent/30 bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="w-fit rounded bg-accent px-3 py-1.5 text-xs text-background transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save answers"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="w-fit rounded border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
            >
              Skip
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
