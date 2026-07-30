@AGENTS.md

# jobschlob

Shared job board for 2 users, with per-user tracking and keyword-weighted scoring. One repo:
frontend, API, schema, and ingest script share types and one Drizzle schema.

## Schema (`src/db/schema.ts`)

- `jobs` — the shared board. Not user-scoped. `id` is a dedupe hash (`lib/dedupe.ts`) of
  source+title+company, so re-ingesting the same posting updates it instead of duplicating it.
- `trackedJobs` — per-user status (`interested | applied | interviewing | offer | rejected |
  archived`) + notes on a job. `(userId, jobId)` unique.
- `preferences` — per-user `keywordWeights` JSON blob (`{ keyword: weight }`).

There is no `users` table. Auth.js has no adapter configured (JWT sessions only), so
**`session.user.email` is the userId** everywhere in the app.

## The userId rule

Every function in `src/db/queries.ts` that touches `trackedJobs` or `preferences` takes `userId`
as its first argument and filters on it. This is the whole defense against one user seeing or
overwriting another user's tracked jobs or prefs — don't add a query that skips it.

The one exception is `upsertJobs`, which writes to the shared `jobs` table and is only ever
called from `scripts/ingest.ts` — jobs aren't user-scoped so there's no userId to filter on.

## Scoring

All scoring logic lives in `src/lib/score.ts` (`scoreJob`), imported by `getBoard` in queries.ts.
Don't duplicate scoring logic elsewhere — if the board's sort order needs to change, change it
there.

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
