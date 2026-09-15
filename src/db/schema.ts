import { pgTable, text, timestamp, jsonb, integer, serial, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(), // dedupe hash, see lib/dedupe.ts
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  url: text("url").notNull(),
  source: text("source").notNull(), // e.g. "greenhouse:acme"
  category: text("category"), // 'tech' | 'consulting' | 'vc_pe' | 'robotics' — set per source in scripts/ingest.ts
  level: text("level"), // 'internship' | 'new_grad' — see lib/level-heuristic.ts
  // 'bachelors' | 'masters' | 'phd' | null — see lib/degree-heuristic.ts. Null for every
  // SimplifyJobs-sourced job (no description text available to classify) and for any
  // Greenhouse/Lever/Ashby posting that doesn't mention a degree requirement at all.
  degreeLevel: text("degree_level"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackedJobs = pgTable(
  "tracked_jobs",
  {
    userId: text("user_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("interested"), // interested | applied | heard_back | oa | interview | offer | rejected | ghosted | archived
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tracked_jobs_user_job_idx").on(t.userId, t.jobId)],
);

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  // Free-text corpus — experience, skills, goals. Scored against jobs (lib/match.ts) and
  // scaffolded into resumes/cover letters (lib/resume-scaffold.ts).
  background: text("background").notNull().default(""),
  // Dashboard "new jobs" filters — { minScore?: number, location?: string, company?: string }.
  // Persisted per-user so filter settings survive a return visit; see lib/dashboard-filters.ts.
  filters: jsonb("filters").notNull().default({}),
  // Optional user-supplied LLM configuration — see lib/llm-config.ts for the shape, lib/crypto.ts
  // for how each stored key is encrypted at rest, and lib/llm-client.ts for how a process (resume /
  // coverLetter / jdParse) resolves its provider+model+key. Null means "use the app's own env-var
  // key and default model for everything", the behavior before a user configures anything here.
  llmConfig: jsonb("llm_config"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobMatches = pgTable(
  "job_matches",
  {
    userId: text("user_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: integer("score").notNull(), // 0-100 compatibility, from lib/match.ts
    rationale: text("rationale"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_matches_user_job_idx").on(t.userId, t.jobId)],
);

// Append-only status history — the source of truth for the analytics heatmap/funnel.
// Written only by trackJob() in queries.ts, and only when the status actually changes.
export const applicationEvents = pgTable(
  "application_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_user_changed_idx").on(t.userId, t.changedAt)],
);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  // Nullable: a resume/cover letter can be general-purpose or tailored to one job.
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // 'resume' | 'cover_letter'
  // 'generated' (workshop scaffold, has latex/no blobUrl) | 'uploaded' (a PDF the user brought
  // in themselves, has blobUrl/no latex) — see lib/latex.ts vs the /api/workshop/upload route.
  source: text("source").notNull().default("generated"),
  latex: text("latex"), // null for uploaded docs — no LaTeX source to recompile from
  // Vercel Blob pathname (private store) for an uploaded PDF — see lib/blob-storage.ts. Null for
  // generated docs, which stay cheap to recompile on demand instead of also storing the PDF.
  blobUrl: text("blob_url"),
  filename: text("filename"), // original upload filename, null for generated docs
  // The resume/cover letter currently in active use, one at a time per (userId, kind) — enforced
  // in queries.ts's setActiveDocument, not here (a partial unique index needs raw SQL either way).
  active: boolean("active").notNull().default(false),
  // { ok: boolean, missingSections: string[], extractedPreview: string } — see lib/ats-check.ts
  atsNotes: jsonb("ats_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
