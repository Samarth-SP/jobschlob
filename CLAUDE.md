@AGENTS.md

# jobschlob

Job dashboard for 2 users: an LLM-scored compatibility feed, per-user application tracking with
full status history, an analytics page, and a resume/cover-letter workshop that scaffolds a
plain-text background corpus into LaTeX, compiles it to a real PDF, and self-checks ATS
parseability. One repo: frontend, API, schema, and ingest script share types and one Drizzle
schema.

## Status / pick up here next session

**Open issue:** the ASCII scene art on the landing page (`src/components/SceneArt.tsx`,
`src/lib/scene-ascii.ts`) — converted from a user-provided reference doodle (frog roasting a
marshmallow by a campfire, plus a tent) — didn't come out looking right once deployed. The
conversion pipeline: `npx asciify-image` was tried first and turned out to have a broken
darkness-mapping bug (rendered the image almost solid black despite the source being a light
background with thin lines — verified by reading raw pixel values directly with Jimp, which came
back correctly light, e.g. `{r:253,g:251,b:248}` at the background). Replaced with a hand-rolled
converter: for each output character cell, take the **minimum** luminance across the corresponding
source-pixel block (preserves thin lines that plain box-averaging washes into faint gray noise),
then **binarize** with a threshold (space vs `#`) rather than a multi-level gradient, since the
source is flat line-art with no real shading — a gradient just picked up anti-aliasing noise
around the edges. Current params: 160 output columns, `charAspect = 0.5`, `threshold = 200`,
trimmed to a tight bounding box. The reference PNG is still sitting untracked at the project root
(`ChatGPT Image Jul 29, 2026 at 10_36_33 PM.png` — gitignored/not committed, it's a reference
file not a build asset) if it needs reprocessing. Likely next steps to try: different threshold,
higher column count for more fidelity, or hand-touching-up the generated art directly rather than
re-deriving it from the image.

**Not yet visually verified by Claude** (no browser tool available all session — every check below
was done via `curl`, direct function calls against the real DB/API, and `npm run build`, never an
actual rendered page): the theme switcher across all 6 presets, the workshop's PDF preview/ATS
banner, the analytics Sankey chart's actual layout/legibility, the dashboard filter inputs, and the
nav logo fade-in timing. Worth a real click-through pass.

## Schema (`src/db/schema.ts`)

- `jobs` — the shared board. Not user-scoped. `id` is a dedupe hash (`lib/dedupe.ts`) of
  source+external-id, so re-ingesting the same posting updates it instead of duplicating it.
- `trackedJobs` — per-user status (`interested | applied | heard_back | oa | interview | offer |
  rejected | ghosted | archived`) + notes on a job. `(userId, jobId)` unique. Current status only
  — `applicationEvents` is the history.
- `applicationEvents` — append-only status-history log, the source of truth for the analytics
  heatmap and Sankey chart. Written **only** by `trackJob()` in queries.ts, and only when the
  status actually changed (including the very first insert) — never insert into this table from
  anywhere else, or the analytics data rots with phantom/duplicate entries.
- `profiles` — per-user free-text `background` corpus (what job-compatibility scoring and the
  workshop both work from) plus a `filters` jsonb column (`DashboardFilters` — min match score,
  location, company substring — see `src/lib/dashboard-filters.ts`) persisting the dashboard's
  new-jobs filter UI across visits.
- `jobMatches` — per-user, per-job LLM compatibility score + rationale, `(userId, jobId)` unique.
  Populated in bulk by `scripts/ingest.ts` (scores newly-seen jobs against every user with a
  profile) — the dashboard never makes a live LLM call to render the ranked feed.
- `documents` — saved resume/cover-letter LaTeX source (not the PDF — PDFs are cheap to recompile
  on demand via `lib/latex.ts`, so there's no Vercel Blob dependency). `jobId` nullable: a
  document can be general-purpose or tailored to one job. `atsNotes` is
  `{ ok, missingSections, extractedPreview }` from `lib/ats-check.ts`.

There is no `users` table and no `preferences` table (the old keyword-weight scoring system —
`lib/score.ts` — was removed once the dashboard/profile pages shipped and nothing read it anymore).
Auth.js has no adapter configured (JWT sessions only), so **`session.user.email` is the userId**
everywhere in the app.

## The userId rule

Every function in `src/db/queries.ts` that touches a per-user table (`trackedJobs`,
`applicationEvents`, `profiles`, `jobMatches`, `documents`) takes `userId` as its first argument
and filters on it. This is the whole defense against one user seeing or overwriting another
user's data — don't add a query that skips it.

The one exception is `upsertJobs`, which writes to the shared `jobs` table and is only ever
called from `scripts/ingest.ts` — jobs aren't user-scoped so there's no userId to filter on.

## Scoring

`src/lib/match.ts` (`scoreJobForUser`) — LLM compatibility scoring (Claude Haiku, constrained JSON
schema) against `profiles.background`. Called from `scripts/ingest.ts` for every newly-seen job ×
every profiled user, skipping jobs that already have a match so a daily re-upsert doesn't re-bill.
Writes `jobMatches`. `getRankedBoard()` in queries.ts sorts by `jobMatches.score DESC NULLS LAST`.

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

`src/lib/resume-scaffold.ts` generates resume/cover-letter LaTeX (Claude Sonnet) from the
background corpus, few-shot against a house-style exemplar in `lib/resume-template.ts` — only
using packages already warmed into the Tectonic cache (`scripts/fixture.tex`). `src/lib/ats-check.ts`
re-extracts text from the compiled PDF via `pdf-parse` to catch the real gotcha (a PDF that looks
fine but whose embedded text is garbled/missing). **`pdf-parse` needs a `DOMMatrix`/`ImageData`/
`Path2D` polyfill stubbed in before it's imported** (it references them even for plain text
extraction, and they don't exist in Node) — done via a dynamic `import()` inside the function,
since a static import would be hoisted above the polyfill assignment. `/api/workshop/generate`
orchestrates scaffold → compile → ATS check → save; session-gated like `/api/track`.

## Dedupe

`src/lib/dedupe.ts` (`jobId`) is the only place job IDs are computed, shared between the ingest
script and anywhere else that needs to reference a job by its natural key. Keys on the source's
own per-listing id, not title/company — an earlier version keyed on title+company and broke when
a source had multiple open listings with the same title in different locations.

## Theming

`src/app/globals.css` defines six semantic CSS variables per theme — `--background`, `--surface`,
`--foreground`, `--foreground-muted`, `--accent`, `--accent-strong`, `--pop`, `--pop-tint` — never
hardcode a literal color in a component; use the Tailwind utilities these map to
(`bg-background`, `text-pop`, etc.). Role meanings: `background`/`surface` = backdrop, `foreground`
= normal text, `accent` = interactive elements (buttons/links/borders/hover/chart marks), `pop` =
reserved for titles/headings only, not general UI. Six presets live as `:root[data-theme="..."]`
blocks (jobschlob light/dark, Gruvbox, Nord, Dracula, Monkeytype) — `src/lib/themes.ts` is the
picker's id/label list, kept in sync with the CSS blocks by hand (small fixed set, not worth
generating). `ThemeSwitcher.tsx` persists the choice to `localStorage` (not per-user DB — a
cosmetic per-browser preference, not worth a DB round trip) and `layout.tsx` has a blocking inline
`<script>` in `<head>` that applies the saved theme before first paint to avoid a flash. The
`Heatmap` component's ramp uses CSS `color-mix()` between `--surface`/`--accent` rather than
hardcoded hex, so it adapts to whichever theme is active.

## ASCII art

`src/lib/ascii-logo.ts` exports the "ANSI Shadow"-font wordmark (generated once via the `figlet`
CLI, hardcoded — no runtime figlet dependency) shared by `AsciiHero.tsx` (big, on the landing page)
and `NavLogo.tsx` (same art, scaled down to `text-[3px]`, centered in the nav, hidden on `/` itself
to avoid doubling up with the big hero). `NavLogo` animates in on every mount as the closest honest
approximation of "the hero arriving in the navbar" — a true continuous shared-element transition
can't survive the full-page redirect through GitHub's OAuth flow, so it just fades in on the first
authenticated page load instead. `src/lib/scene-ascii.ts` is the (currently imperfect — see Status
above) converted doodle rendered by `SceneArt.tsx` at the bottom of the landing page.

## Analytics

`/analytics` — `getApplicationEventsByDay()` feeds the heatmap, `getAvgMatchScore()` feeds the
stat row. The status-flow chart is a real Sankey (`d3-sankey` + `SankeyChart.tsx`), built from
`getStatusTransitions()` — actual consecutive status-to-status transitions per job, aggregated
into edge counts in JS (fetch all `applicationEvents` for the user, group by jobId, walk each
job's ordered sequence) rather than a SQL self-join, since the dataset is tiny (2 users). This
replaced an earlier per-stage-count horizontal-bar funnel, which couldn't represent jobs skipping
or revisiting stages.

## Dashboard filters

`/dashboard`'s new-jobs list (`NewJobsSection.tsx`, client component) filters in-memory (instant,
no round trip) by min match score / location / company, and debounce-persists the filter values to
`profiles.filters` via `POST /api/dashboard/filters` so they're there on the next visit. Every
posting shows posted date, company, location, and match score.

## Migrations

Never auto-run on deploy.

1. Change `src/db/schema.ts`.
2. `npm run db:generate` locally — generates SQL into `drizzle/`, commit it.
3. Manually trigger the `migrate.yml` GitHub Action (`workflow_dispatch`) to apply it, using
   `DIRECT_DATABASE_URL` (non-pooled Neon connection). In practice this session, migrations were
   also applied directly via `npm run db:migrate` against `DIRECT_DATABASE_URL` from local `.env`
   right after generating — both paths hit the same DB, so either is fine; the Action exists so
   this is repeatable without a local `.env`.
4. Only then push the app code that depends on the new schema.

Migrations so far: `0000` initial (jobs/trackedJobs/preferences), `0001` v2 tables (profiles/
jobMatches/applicationEvents/documents), `0002` drop `preferences`, `0003` add `profiles.filters`.

## Env vars

See `.env.example`. `DATABASE_URL` is the pooled Neon connection (app runtime + ingest).
`DIRECT_DATABASE_URL` is the non-pooled one (migrations only). `ANTHROPIC_API_KEY` powers match
scoring + the workshop. All three go in GitHub repo secrets (ingest/migrate workflows) *and*
Vercel env vars (production + preview); everything else (`AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`,
`ALLOWED_EMAILS`) is Vercel-only.

## Ingest

`scripts/ingest.ts` runs standalone via `tsx` (no Next.js import), on a GitHub Actions cron
(`.github/workflows/ingest.yml`) and via `workflow_dispatch`. It also prunes `jobs` rows older
than 60 days that have no `trackedJobs` referencing them, and scores new jobs against every
profiled user (see Scoring above).

## Routes

- `/` — public ASCII-hero landing; redirects signed-in users to `/dashboard`.
- `/dashboard` — ranked new-jobs feed with filters, tracked-jobs list, avg-match stat tile linking
  to `/analytics`.
- `/profile` — background corpus editor.
- `/workshop` — resume/cover-letter generation, PDF preview, ATS check.
- `/analytics` — heatmap, Sankey status flow, avg match score.
- API: `/api/track` (status changes), `/api/dashboard/filters` (persist filters),
  `/api/workshop/generate` (scaffold → compile → check → save), `/api/auth/[...nextauth]`.

## Deploy

GitHub → Vercel is connected for auto-deploy on push to `main` (production). Every feature this
session was pushed, built, and confirmed `● Ready` on Vercel before moving on — check
`npx vercel list --limit 1` if a deploy's status is ever in doubt after a push.
