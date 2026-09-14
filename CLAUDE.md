@AGENTS.md

# jobschlob

Job dashboard for 2 users: a keyword-scored compatibility feed, per-user application tracking with
full status history, an analytics page, and a resume/cover-letter workshop that turns a plain-text
background corpus into structured content (one LLM call), fills a fixed LaTeX template, compiles it
to a real PDF, trims it to one page, and self-checks ATS parseability. One repo: frontend, API,
schema, and ingest script share types and one Drizzle schema.

## Status / pick up here next session

**Open issue:** the ASCII scene art on the landing page (`src/components/SceneArt.tsx`,
`src/lib/scene-ascii.ts`) still looks wrong (slanted/"italicized", low detail). Prior conversion
attempts were all reverted at the user's request — the file is the original pixel-sampled version
(160 cols, `charAspect = 0.5`, `threshold = 200`). Reference PNG sits untracked at the project root
(gitignored). Don't re-attempt without the user asking.

**Not yet visually verified by Claude** (no browser tool): theme switcher across the 6 presets,
the analytics Sankey chart, the nav logo fade-in. The workshop resume/cover-letter output *was*
rendered and eyeballed (Tectonic locally → PNG) and matches the house template.

**Recent sessions' major changes (all shipped):**
- Ingest widened from Greenhouse-only to Greenhouse + Lever + Ashby + SimplifyJobs, with a
  `robotics` category and mostly-robotics direct boards. `classifyLevel` gained a **lenient mode**
  for robotics boards (pass unless visibly senior). Job-match scoring is local keyword matching,
  not an LLM. See Ingest / Scoring.
- **Per-company retention** (`src/lib/company-tier.ts`): big-tech/AI + mid-to-large robotics/AV
  companies keep listings 30 days; everyone else 7. `withinRetentionWindow()` /
  `pastRetentionWindow()` in queries.ts are shared by `getRankedBoard` and the ingest prune.
- **Workshop rewrite:** the LLM no longer writes LaTeX — it returns structured content via an
  Anthropic tool schema, which fills a fixed template (Jake Gutierrez's resume template) that a
  compile→count-pages→trim loop forces to one page. See LaTeX / PDF pipeline.

**Hard-won lesson, still true:** always combine Drizzle query conditions with `and()`/`or()`,
never JS `&&`/`||` — JS `&&` silently keeps only the last operand. A `where(isNull(...) &&
notInArray(...))` once deleted 4,358 job rows (recovered — job IDs are deterministic hashes).

## Schema (`src/db/schema.ts`)

- `jobs` — the shared board. Not user-scoped. `id` is a dedupe hash (`lib/dedupe.ts`) of
  source+external-id, so re-ingesting the same posting updates it instead of duplicating it.
  `category` (`tech | consulting | vc_pe | robotics`) and `level` (`internship | new_grad`) are set
  per source in `scripts/ingest.ts` — see Ingest below. Both nullable: a handful of pre-existing
  tracked jobs from before these columns existed still have `null` in both and are deliberately
  left alone (never delete/backfill a tracked job's row out from under a user's application history).
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
- `jobMatches` — per-user, per-job keyword-overlap compatibility score + rationale, `(userId,
  jobId)` unique. Populated in bulk by `scripts/ingest.ts` (scores newly-seen jobs against every
  user with a profile) — no LLM involved, see Scoring below.
- `documents` — saved resume/cover-letter LaTeX source (not the PDF — PDFs are cheap to recompile
  on demand via `lib/latex.ts`, so there's no Vercel Blob dependency). `jobId` nullable: a
  document can be general-purpose or tailored to one job. `atsNotes` is
  `{ ok, missingSections, extractedPreview, pageCount? }` from `lib/ats-check.ts` (`pageCount`
  absent on rows written before the one-page fitter shipped).

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

`src/lib/match.ts` (`scoreJobForUser`) — pure keyword-overlap compatibility scoring, no LLM
involved and fully synchronous. Tokenizes `profiles.background` and the job's `title`+`company`
(lowercased, stopwords stripped, tech-ish tokens like `c++`/`node.js` kept intact), scores as
`(matched tokens / job's own token count) * 100`, and returns a `rationale` string listing which
keywords matched. Called from `scripts/ingest.ts` for every newly-seen job × every profiled user,
skipping jobs that already have a match. Writes `jobMatches`. `getRankedBoard()` in queries.ts
sorts by `jobMatches.score DESC NULLS LAST`.

This used to be an LLM call (Claude Haiku, constrained JSON schema) but got switched to keyword
matching once the ingest sources grew from one company to thousands of jobs (see Ingest below) —
thousands of sequential LLM calls per ingest run was both slow (~1.5hr for the first backfill) and
a real ongoing cost for a score that's advisory at best. **The LLM budget is reserved for the
resume/cover-letter workshop** (`lib/resume-scaffold.ts`, still Claude Sonnet) — that's the one
place in this app where generation quality actually depends on real language understanding.

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

**Workshop generation — the LLM never writes LaTeX.** `src/lib/resume-scaffold.ts`:

1. One Claude Sonnet call per document with a forced **tool schema** (`emit_resume` /
   `emit_cover_letter`, `tool_choice: {type: "tool"}`) — the model returns *structured content*
   only (name, contact, experience entries, skill groups, …), never markup.
2. `src/lib/resume-template.ts` `renderResume` / `renderCoverLetter` fill a **fixed LaTeX
   skeleton** from that content, LaTeX-escaping every field (`& % $ # _ ~ ^ {}`) so a stray char
   in a job title can't break the compile. `RESUME_PREAMBLE` is Jake Gutierrez's widely-used
   resume template (MIT, based on sb2nov) reproduced verbatim except `charter`→`XCharter` and the
   two `\input{glyphtounicode}` / `\pdfgentounicode` lines dropped (pdfTeX-only; latex.ts strips
   them anyway, but omitting avoids a spurious warning). Every package it uses is warmed into the
   Tectonic cache (`scripts/fixture.tex`). `ResumeData` sections render in order: education,
   experience, projects, skills.
3. `fitToOnePage` loops render → `compileLatex` → `checkAts` (which now also returns `pageCount`)
   → trim one lowest-priority line → repeat, until it's one page or nothing's left to cut
   (`trimResume` drops trailing bullets, projects before experience; education never trimmed).
   Anything trimmed is reported in the response `warnings`, surfaced in the workshop's notice
   banner. Cap: 15 trims.

Layout drift is structurally impossible now — the model can't touch spacing, fonts, or sections.
The one thing not locally testable is the page-count *trigger*: `checkAts`'s pdfjs worker setup
only works in the Next/Vercel runtime, so under plain `tsx` it returns `pageCount: 1` and the loop
no-ops (safe degradation). If you rebuild the template, paste the target `.tex` — the tool schema
and `renderResume` are hand-matched to the current one's structure.

`src/lib/ats-check.ts` re-extracts text from the compiled PDF via `pdf-parse` to catch the real
gotcha (a PDF that looks fine but whose embedded text is garbled/missing). **`pdf-parse` needs a
`DOMMatrix`/`ImageData`/`Path2D` polyfill stubbed in before it's imported** (it references them
even for plain text extraction, and they don't exist in Node) — done via a dynamic `import()`
inside the function, since a static import would be hoisted above the polyfill assignment.
`/api/workshop/generate` calls `buildResume` / `buildCoverLetter` (which return
`{ latex, pdf, warnings, atsNotes }`) then saves; session-gated like `/api/track`.

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
no round trip) by min match score, company substring, and multi-select **locations**,
**categories** (tech/consulting/vc_pe), and **levels** (internship/new_grad) — see
`src/lib/dashboard-filters.ts` for the `DashboardFilters` shape. Locations are a native `<select
multiple>` populated from whatever distinct `job.location` values are actually present in the
current job list (no separate query, no hardcoded location list); category/level are checkbox
groups off the fixed enums. An empty selection for any of the three means "no filter" (same
convention as the pre-existing minScore/company fields). Filter values debounce-persist to
`profiles.filters` via `POST /api/dashboard/filters` so they're there on the next visit. Every
posting shows posted date, company, location, level, category, and match score.

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
jobMatches/applicationEvents/documents), `0002` drop `preferences`, `0003` add `profiles.filters`,
`0004` add `jobs.category`/`jobs.level`.

## Env vars

See `.env.example`. `DATABASE_URL` is the pooled Neon connection (app runtime + ingest).
`DIRECT_DATABASE_URL` is the non-pooled one (migrations only). `ANTHROPIC_API_KEY` powers the
workshop only (`lib/resume-scaffold.ts`) — ingest's job-match scoring is local keyword matching,
no LLM/API key needed, see Scoring above. All three go in GitHub repo secrets (ingest/migrate
workflows) *and*
Vercel env vars (production + preview); everything else (`AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`,
`ALLOWED_EMAILS`) is Vercel-only.

## Ingest

`scripts/ingest.ts` runs standalone via `tsx` (no Next.js import; local runs need env vars
exported from `.env` manually, e.g. `set -a; source .env; set +a`), on a GitHub Actions cron
(`.github/workflows/ingest.yml`, weekdays 13:00 UTC) and via `workflow_dispatch`. It fetches all
sources with **`Promise.allSettled`** (one dead board can't abort the run), upserts, scores new
jobs against every profiled user (see Scoring), then prunes — see Retention below.

Source fetches use ATS aggregator APIs, all no-auth, all entry-level only:

- **Greenhouse** (`GREENHOUSE_BOARDS` + `ROBOTICS_GREENHOUSE`), **Lever** (`LEVER_BOARDS`),
  **Ashby** (`ROBOTICS_ASHBY`) — per-company boards, `{slug, category}`. Boards mix every seniority,
  so titles run through `src/lib/level-heuristic.ts` `classifyLevel(title, lenient)`:
  - **strict** (default, for tech/consulting/vc_pe): a title needs a positive entry-level marker
    (intern, junior, new grad, analyst, "Engineer I", …) to pass. Biased hard toward false
    negatives.
  - **lenient** (passed when `board.category === "robotics"`): anything not visibly senior passes
    as `new_grad` — robotics startups title almost everything as a bare "\<X\> Engineer" and strict
    mode dropped ~95% of the board. A few mid-level roles leak in; accepted tradeoff.
  **Verify a slug belongs to who you think before adding** — a board 200ing is not proof of
  identity (`boards-api.greenhouse.io/v1/boards/bcg/jobs` resolves but is not Boston Consulting
  Group).
- **SimplifyJobs feeds** (`SIMPLIFY_FEEDS`) — `raw.githubusercontent.com/SimplifyJobs/
  {Summer2027-Internships,New-Grad-Positions}/dev/.github/scripts/listings.json`, community JSON
  aggregating hundreds of companies, updated hourly. Level comes from which feed. Filter to
  `active: true`. **`postedAt` = `max(date_posted, date_updated)`** — Simplify re-confirms
  still-open listings by bumping `date_updated`, and keying the retention window on the frozen
  `date_posted` alone was pruning currently-active listings.

`dedupeAcrossSources` drops a SimplifyJobs row when a direct-ATS row describes the same posting
(same normalized company/title/location) — the direct source is fresher.

Sources considered and deliberately skipped for now (see conversation history if picking this back
up): `jobright-ai`'s consulting-internship GitHub repos (README-table only, affiliate redirect
links instead of the original posting URL, only last 7 days shown — lower quality than the above)
and JobSpy-style LinkedIn/Indeed keyword scraping for VC/PE roles (best coverage for that vertical,
but real ToS/blocking risk and scraper fragility). VC/PE coverage stays thin without one of these.

**Scale note:** the SimplifyJobs feeds alone are ~5,000 active entries, so `upsertJobs` batches
inserts (`UPSERT_BATCH_SIZE = 500` in queries.ts) — a single multi-thousand-row insert over Neon's
HTTP driver fails outright.

## Retention (the board's freshness window)

`src/lib/company-tier.ts`: `DEFAULT_RETENTION_DAYS = 7`, `EXTENDED_RETENTION_DAYS = 30`. The
`EXTENDED_RETENTION_COMPANIES` list — large big-tech/AI + mid-to-large robotics/AV companies only
(no finance, quant, consulting, defense, semis, auto, consumer — deliberately scoped by the owner)
— keeps those companies' listings on the board for 30 days instead of 7. Matched **exact,
case-insensitive** against `jobs.company` (SimplifyJobs' `company_name`, or a Greenhouse/Lever/
Ashby slug); feed name variants like `"PricewaterhouseCoopers (PwC)"` are their own literal
entries. Direct robotics boards store the slug (`figureai`, `waabi`), so the slugs are on the list
too.

`withinRetentionWindow()` / `pastRetentionWindow()` in `queries.ts` are the single source of
truth: `getRankedBoard` uses the former (what a user sees), `scripts/ingest.ts` the latter (what
gets pruned), so display and prune can never drift. Both are keyed on `postedAt`, not `createdAt`
(ingest time). A job any user tracks is exempt from pruning. (There is no `board-retention.ts` any
more — it was folded into `company-tier.ts`.)

## Routes

- `/` — public ASCII-hero landing; redirects signed-in users to `/dashboard`.
- `/dashboard` — ranked new-jobs feed with filters, tracked-jobs list, avg-match stat tile linking
  to `/analytics`.
- `/profile` — background corpus editor.
- `/workshop` — resume/cover-letter generation, PDF preview, ATS check.
- `/analytics` — heatmap, Sankey status flow, avg match score.
- API: `/api/track` (status changes), `/api/dashboard/filters` (persist filters),
  `/api/workshop/generate` (LLM structured content → fill template → compile → one-page trim loop
  → ATS check → save), `/api/workshop/upload`, `/api/workshop/documents` (recompile/rescan/
  activate/delete), `/api/auth/[...nextauth]`.

## Deploy

GitHub → Vercel is connected for auto-deploy on push to `main` (production). Every feature this
session was pushed, built, and confirmed `● Ready` on Vercel before moving on — check
`npx vercel list --limit 1` if a deploy's status is ever in doubt after a push.
