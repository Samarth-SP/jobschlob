import { pgTable, text, timestamp, jsonb, integer, serial, index, uniqueIndex } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(), // dedupe hash, see lib/dedupe.ts
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  url: text("url").notNull(),
  source: text("source").notNull(), // e.g. "greenhouse:acme"
  category: text("category"), // 'tech' | 'consulting' | 'vc_pe' — set per source in scripts/ingest.ts
  level: text("level"), // 'internship' | 'new_grad' — see lib/level-heuristic.ts
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
  latex: text("latex").notNull(),
  // { ok: boolean, missingSections: string[], extractedPreview: string } — see lib/ats-check.ts
  atsNotes: jsonb("ats_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
