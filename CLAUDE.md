@AGENTS.md

# jobschlob

Job dashboard for 2 users: an LLM-scored compatibility feed, per-user application tracking with
full status history, an analytics page, and a resume/cover-letter workshop that scaffolds a
plain-text background corpus into LaTeX, compiles it to a real PDF, and self-checks ATS
parseability. One repo: frontend, API, schema, and ingest script share types and one Drizzle
schema.

## Schema (`src/db/schema.ts`)

- `jobs` — the shared board. Not user-scoped. `id` is a dedupe hash (`lib/dedupe.ts`) of
  source+external-id, so re-ingesting the same posting updates it instead of duplicating it.
- `trackedJobs` — per-user status (`interested | applied | heard_back | oa | interview | offer |
  rejected | ghosted | archived`) + notes on a job. `(userId, jobId)` unique. Current status only
  — `applicationEvents` is the history.
- `applicationEvents` — append-only status-history log, the source of truth for the analytics
  heatmap/funnel. Written **only** by `trackJob()` in queries.ts, and only when the status
  actually changed (including the very first insert) — never insert into this table from
  anywhere else, or the analytics data rots with phantom/duplicate entries.
- `profiles` — per-user free-text `background` corpus. This is what job-compatibility scoring
  (`lib/match.ts`) and the resume/cover-letter workshop (`lib/resume-scaffold.ts`) both work from.
- `jobMatches` — per-user, per-job LLM compatibility score + rationale, `(userId, jobId)` unique.
  Populated in bulk by `scripts/ingest.ts` (scores newly-seen jobs against every user with a
  profile) — the dashboard never makes a live LLM call to render the ranked feed.
- `documents` — saved resume/cover-letter LaTeX source (not the PDF — PDFs are cheap to recompile
  on demand via `lib/latex.ts`, so there's no Vercel Blob dependency). `jobId` nullable: a
  document can be general-purpose or tailored to one job. `atsNotes` is
  `{ ok, missingSections, extractedPreview }` from `lib/ats-check.ts`.
- `preferences` — legacy keyword-weight scoring, **scheduled for removal** once `/profile` ships
  and nothing reads it anymore. Superseded by `profiles.background` + `jobMatches`. Don't build
  anything new on it.

There is no `users` table. Auth.js has no adapter configured (JWT sessions only), so
**`session.user.email` is the userId** everywhere in the app.

## The userId rule

Every function in `src/db/queries.ts` that touches a per-user table (`trackedJobs`,
`applicationEvents`, `profiles`, `jobMatches`, `documents`, `preferences`) takes `userId` as its
first argument and filters on it. This is the whole defense against one user seeing or
overwriting another user's data — don't add a query that skips it.

The one exception is `upsertJobs`, which writes to the shared `jobs` table and is only ever
called from `scripts/ingest.ts` — jobs aren't user-scoped so there's no userId to filter on.

## Scoring

Two independent scoring systems exist during the migration off keyword weights:

- `src/lib/score.ts` (`scoreJob`) — legacy keyword-weight scoring, dies with `preferences`.
- `src/lib/match.ts` (`scoreJobForUser`) — LLM compatibility scoring against `profiles.background`,
  the one that matters going forward. Called from `scripts/ingest.ts`, writes `jobMatches`.

Don't duplicate scoring logic elsewhere — if the board's sort order needs to change, change it in
whichever of these is still live.

## LaTeX / PDF pipeline

`src/lib/latex.ts` (`compileLatex`) shells out to a Tectonic binary at `bin/tectonic`, downloaded
and cache-warmed at **build time** by `scripts/setup-tectonic.js` (wired into `"build"` in
package.json, not just `postinstall` — Vercel can restore a cached `node_modules` and skip
postinstall). The warmed `.tectonic-cache/` ships with the function via `outputFileTracingIncludes`
in `next.config.ts`, so compiling at request time needs zero network access — don't let it regress
to fetching TeX packages live, that risks flaky latency on cold containers. Both `bin/` and
`.tectonic-cache/` are gitignored *and* vercelignored — they're rebuilt fresh on every build (a
stale local macOS binary uploaded via `vercel --prod` will crash on Vercel's Linux build machine
with "cannot execute binary file"; this bit us once, that's why `.vercelignore` exists).

## Dedupe

`src/lib/dedupe.ts` (`jobId`) is the only place job IDs are computed, shared between the ingest
script and anywhere else that needs to reference a job by its natural key.

## Migrations

Never auto-run on deploy.

1. Change `src/db/schema.ts`.
2. `npm run db:generate` locally — generates SQL into `drizzle/`, commit it.
3. Manually trigger the `migrate.yml` GitHub Action (`workflow_dispatch`) to apply it, using
   `DIRECT_DATABASE_URL` (non-pooled Neon connection).
4. Only then push the app code that depends on the new schema.

## Env vars

See `.env.example`. `DATABASE_URL` is the pooled Neon connection (app runtime + ingest).
`DIRECT_DATABASE_URL` is the non-pooled one (migrations only). Both go in GitHub repo secrets;
everything else (`AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`, `ALLOWED_EMAILS`) is Vercel-only.

## Ingest

`scripts/ingest.ts` runs standalone via `tsx` (no Next.js import), on a GitHub Actions cron
(`.github/workflows/ingest.yml`) and via `workflow_dispatch`. It also prunes `jobs` rows older
than 60 days that have no `trackedJobs` referencing them.
