import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(), // dedupe hash, see lib/dedupe.ts
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  url: text("url").notNull(),
  source: text("source").notNull(), // e.g. "greenhouse:acme"
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
    status: text("status").notNull().default("interested"), // interested | applied | interviewing | offer | rejected | archived
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tracked_jobs_user_job_idx").on(t.userId, t.jobId)],
);

export const preferences = pgTable("preferences", {
  userId: text("user_id").primaryKey(),
  // { keyword: weight } — see lib/score.ts for how this is applied
  keywordWeights: jsonb("keyword_weights").notNull().default({}),
});
